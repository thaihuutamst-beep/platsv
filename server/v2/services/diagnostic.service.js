const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dbCore = require('../core/database');

class DiagnosticService {
    constructor() {
        this.io = null;
    }

    setSocket(io) { this.io = io; }

    /**
     * Get detailed metadata from a video file using FFprobe
     */
    async getVideoMetadata(filePath) {
        return new Promise((resolve) => {
            const metadata = {
                valid: false,
                exists: false,
                readable: false,
                duration: 0,
                width: 0,
                height: 0,
                fps: 0,
                bitrate: 0,
                codec_video: null,
                codec_audio: null,
                format: null,
                rotation: 0,
                has_audio: false,
                audio_channels: 0,
                sample_rate: 0,
                file_size: 0,
                error_message: null,
                raw_data: null
            };

            // Check if file exists
            if (!fs.existsSync(filePath)) {
                metadata.error_message = 'File does not exist';
                return resolve(metadata);
            }
            metadata.exists = true;

            // Check file size
            try {
                const stats = fs.statSync(filePath);
                metadata.file_size = stats.size;
                metadata.file_created_at = stats.birthtime;
                metadata.file_modified_at = stats.mtime;

                if (stats.size === 0) {
                    metadata.error_message = 'File is empty (0 bytes)';
                    return resolve(metadata);
                }

                if (stats.size < 1000) {
                    metadata.error_message = `File too small (${stats.size} bytes) - likely corrupt`;
                }
            } catch (e) {
                metadata.error_message = `Cannot read file stats: ${e.message}`;
                return resolve(metadata);
            }

            // Use FFprobe for detailed metadata
            const ffprobe = spawn('ffprobe', [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                filePath
            ]);

            let stdout = '';
            let stderr = '';

            ffprobe.stdout.on('data', (data) => { stdout += data.toString(); });
            ffprobe.stderr.on('data', (data) => { stderr += data.toString(); });

            const timeout = setTimeout(() => {
                ffprobe.kill();
                metadata.error_message = 'FFprobe timeout (20s)';
                resolve(metadata);
            }, 20000);

            ffprobe.on('close', (code) => {
                clearTimeout(timeout);

                if (code !== 0) {
                    metadata.error_message = `FFprobe failed with code ${code}`;
                    if (stderr) metadata.error_message += `: ${stderr.substring(0, 200)}`;
                    return resolve(metadata);
                }

                try {
                    const data = JSON.parse(stdout);
                    metadata.raw_data = data;
                    metadata.valid = true;
                    metadata.readable = true;

                    // Parse format info
                    if (data.format) {
                        metadata.duration = parseFloat(data.format.duration) || 0;
                        metadata.bitrate = parseInt(data.format.bit_rate) || 0;
                        metadata.format = data.format.format_name;
                    }

                    // Parse video stream
                    const videoStream = data.streams?.find(s => s.codec_type === 'video');
                    if (videoStream) {
                        metadata.width = videoStream.width || 0;
                        metadata.height = videoStream.height || 0;
                        metadata.codec_video = videoStream.codec_name;

                        // Extract FPS
                        if (videoStream.r_frame_rate) {
                            const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
                            metadata.fps = den ? (num / den).toFixed(2) : num;
                        }

                        // Extract rotation from side_data
                        if (videoStream.side_data_list) {
                            const rotationData = videoStream.side_data_list.find(s => s.rotation !== undefined);
                            if (rotationData) metadata.rotation = Math.abs(rotationData.rotation);
                        }
                        // Also check tags for rotation
                        if (videoStream.tags?.rotate) {
                            metadata.rotation = parseInt(videoStream.tags.rotate) || 0;
                        }
                    }

                    // Parse audio stream
                    const audioStream = data.streams?.find(s => s.codec_type === 'audio');
                    if (audioStream) {
                        metadata.has_audio = true;
                        metadata.codec_audio = audioStream.codec_name;
                        metadata.audio_channels = audioStream.channels || 0;
                        metadata.sample_rate = parseInt(audioStream.sample_rate) || 0;
                    }

                    // Validate duration
                    if (metadata.duration <= 0) {
                        metadata.error_message = 'Invalid duration (0 or negative)';
                        metadata.valid = false;
                    }

                } catch (e) {
                    metadata.error_message = `Failed to parse FFprobe output: ${e.message}`;
                }

                resolve(metadata);
            });

            ffprobe.on('error', (err) => {
                clearTimeout(timeout);
                metadata.error_message = `FFprobe spawn error: ${err.message}`;
                resolve(metadata);
            });
        });
    }

    /**
     * Diagnose a single video and return status
     */
    async diagnoseVideo(videoId) {
        const db = await dbCore.connectDB();
        const video = await db.get("SELECT * FROM videos WHERE id = ?", videoId);

        if (!video) {
            return { error: 'Video not found in database' };
        }

        const metadata = await this.getVideoMetadata(video.path);

        // Determine status
        let status = 'ok';
        let is_corrupt = 0;
        let is_empty = 0;

        if (!metadata.exists) {
            status = 'missing';
        } else if (metadata.file_size === 0) {
            status = 'empty';
            is_empty = 1;
        } else if (!metadata.valid) {
            status = 'corrupt';
            is_corrupt = 1;
        } else if (metadata.duration <= 0) {
            status = 'no_duration';
            is_corrupt = 1;
        }

        // Update database with diagnostic info
        await db.run(`
            UPDATE videos SET
                width = ?,
                height = ?,
                fps = ?,
                bitrate = ?,
                codec_video = ?,
                codec_audio = ?,
                format = ?,
                rotation = ?,
                has_audio = ?,
                audio_channels = ?,
                sample_rate = ?,
                status = ?,
                error_message = ?,
                is_corrupt = ?,
                is_empty = ?,
                duration = ?,
                scanned_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            metadata.width,
            metadata.height,
            metadata.fps,
            metadata.bitrate,
            metadata.codec_video,
            metadata.codec_audio,
            metadata.format,
            metadata.rotation,
            metadata.has_audio ? 1 : 0,
            metadata.audio_channels,
            metadata.sample_rate,
            status,
            metadata.error_message,
            is_corrupt,
            is_empty,
            metadata.duration,
            videoId
        ]);

        return {
            id: videoId,
            filename: video.filename,
            path: video.path,
            status,
            metadata: {
                width: metadata.width,
                height: metadata.height,
                fps: metadata.fps,
                duration: metadata.duration,
                codec_video: metadata.codec_video,
                codec_audio: metadata.codec_audio,
                rotation: metadata.rotation,
                has_audio: metadata.has_audio
            },
            error: metadata.error_message
        };
    }

    /**
     * Diagnose all videos in database
     */
    async diagnoseAllVideos() {
        const db = await dbCore.connectDB();
        const videos = await db.all("SELECT id, filename, path FROM videos");

        const results = {
            total: videos.length,
            ok: 0,
            missing: 0,
            empty: 0,
            corrupt: 0,
            no_duration: 0,
            details: []
        };

        for (const video of videos) {
            const result = await this.diagnoseVideo(video.id);
            results.details.push(result);

            if (result.status === 'ok') results.ok++;
            else if (result.status === 'missing') results.missing++;
            else if (result.status === 'empty') results.empty++;
            else if (result.status === 'corrupt') results.corrupt++;
            else if (result.status === 'no_duration') results.no_duration++;

            if (this.io) {
                this.io.emit('diagnostic_progress', {
                    current: results.details.length,
                    total: videos.length,
                    file: video.filename,
                    status: result.status
                });
            }
        }

        if (this.io) {
            this.io.emit('diagnostic_complete', results);
        }

        return results;
    }

    /**
     * Get problematic videos from database
     */
    async getProblematicVideos() {
        const db = await dbCore.connectDB();
        return await db.all(`
            SELECT id, filename, path, status, error_message, is_corrupt, is_empty, size, duration
            FROM videos 
            WHERE status != 'ok' OR is_corrupt = 1 OR is_empty = 1 OR duration <= 0
        `);
    }

    /**
     * Re-scan videos that need attention
     */
    async rescanProblematic() {
        const db = await dbCore.connectDB();
        const videos = await db.all("SELECT id FROM videos WHERE needs_rescan = 1 OR status != 'ok'");

        for (const video of videos) {
            await this.diagnoseVideo(video.id);
        }

        return { rescanned: videos.length };
    }
}

module.exports = new DiagnosticService();

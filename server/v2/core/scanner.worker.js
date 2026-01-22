const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { spawn } = require('child_process');

// --- CẤU HÌNH ---
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v']);
const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.bmp', '.gif']);

// DANH SÁCH ĐEN (QUAN TRỌNG: Chặn quét rác hệ thống)
const IGNORED_NAMES = new Set([
    'AppData', 'Application Data', 'Local Settings', 'Start Menu', 'Cookies', 'NetHood', 'PrintHood', 'Recent', 'SendTo', 'Templates',
    '$RECYCLE.BIN', 'System Volume Information', 'Recovery', 'Config.Msi', 'Windows', 'Program Files', 'Program Files (x86)',
    'node_modules', '.git', '.vscode', '.idea', 'build', 'dist',
    'Android', 'libs', 'obj', 'bin',
    'Temp', 'Tmp', 'Cache', 'logs',
    'OneDriveTemp', '.Trash-1000'
]);

const THUMB_DIR = path.resolve(__dirname, '../../../data/thumbnails');
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

let isCancelled = false;
let stats = { scanned: 0, skippedDirs: [], videosFound: 0, photosFound: 0, thumbsGenerated: 0, thumbsSkipped: 0 };

async function walkDir(dir) {
    if (isCancelled) return;

    try {
        const files = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const file of files) {
            if (isCancelled) break;
            const fullPath = path.join(dir, file.name);

            // Bỏ qua file ẩn (.) và thư mục rác
            if (file.name.startsWith('.') || IGNORED_NAMES.has(file.name)) continue;

            if (file.isDirectory()) {
                await walkDir(fullPath);
            } else if (file.isFile()) {
                const ext = path.extname(file.name).toLowerCase();
                if (VIDEO_EXTENSIONS.has(ext)) {
                    await processMedia(fullPath, file.name, 'video');
                } else if (PHOTO_EXTENSIONS.has(ext)) {
                    await processMedia(fullPath, file.name, 'photo');
                }
            }

            // Heartbeat: Báo cáo mỗi 50 file để không spam log
            stats.scanned++;
            if (stats.scanned % 50 === 0) {
                parentPort.postMessage({ type: 'heartbeat', count: stats.scanned });
            }
        }
    } catch (err) {
        // Lỗi quyền truy cập (Access Denied) -> Bỏ qua âm thầm
    }
}

async function processMedia(filePath, fileName, type) {
    if (type === 'video') stats.videosFound++;
    else stats.photosFound++;

    // PHÁT HIỆN CLOUD PATH
    const lowerPath = filePath.toLowerCase();
    const isCloud = lowerPath.includes('onedrive') ||
        lowerPath.includes('google drive') ||
        lowerPath.includes('dropbox') ||
        lowerPath.includes('icloud');

    // Timeout config
    const timeoutScale = isCloud ? 3 : 1;
    const METADATA_TIMEOUT = 5000 * timeoutScale;
    const THUMB_TIMEOUT = 8000 * timeoutScale;

    // Tên thumb safe
    const safeName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const thumbName = `thumb_${type}_${safeName}.jpg`;
    const previewName = `preview_${safeName}.mp4`;
    const thumbPathFull = path.join(THUMB_DIR, thumbName);
    const previewPathFull = path.join(THUMB_DIR, previewName); // For now, keep previews in thumb dir or new dir
    const thumbRelPath = `thumbnails/${thumbName}`;
    const previewRelPath = `thumbnails/${previewName}`;

    // 1. Get Metadata FIRST (to know duration)
    try {
        metadata = await getMetadata(filePath, type, METADATA_TIMEOUT);
    } catch (e) { console.error(`Metadata Error: ${filePath}`, e); }

    // 2. Check & Generate Thumbnail
    if (fs.existsSync(thumbPathFull)) {
        stats.thumbsSkipped++;
    } else {
        stats.thumbsGenerated++;

        // Smart Seek: 20% of duration, or 5s, max 30s
        let seekTime = '00:00:05';
        if (metadata.duration) {
            if (metadata.duration < 5) seekTime = '00:00:00';
            else if (metadata.duration < 30) seekTime = new Date(metadata.duration * 0.2 * 1000).toISOString().substr(11, 8);
            // else default 5s
        }

        const success = await generateThumbnail(filePath, thumbPathFull, type, THUMB_TIMEOUT, seekTime);
        if (!success) {
            // Retry at 0s if failed
            await generateThumbnail(filePath, thumbPathFull, type, THUMB_TIMEOUT, '00:00:00');
        }
    }

    // 1b. Check Preview (Video Only)
    let hasPreview = false;
    if (type === 'video') {
        if (fs.existsSync(previewPathFull)) {
            hasPreview = true;
        } else {
            hasPreview = await generatePreview(filePath, previewPathFull, THUMB_TIMEOUT);
        }
    }

    // 3. Size
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch (e) { }

    // 4. Send Result
    parentPort.postMessage({
        type: type === 'video' ? 'video_processed' : 'photo_processed',
        data: {
            filename: fileName,
            path: filePath,
            size: size,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            date_taken: metadata.date_taken,
            thumbnail_path: fs.existsSync(thumbPathFull) ? thumbRelPath : (type === 'photo' ? '' : ''),
            preview_path: hasPreview ? previewRelPath : '',
            is_cloud: isCloud ? 1 : 0,
            fps: metadata.fps,
            bitrate: metadata.bitrate,
            codec_video: metadata.codec_video,
            codec_audio: metadata.codec_audio,
            rotation: metadata.rotation,
            audio_channels: metadata.audio_channels,
            sample_rate: metadata.sample_rate,
            has_audio: metadata.has_audio ? 1 : 0
        }
    });
}

async function generateThumbnail(input, output, type, timeout, seek = '00:00:05') {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeout);

        const args = (type === 'video')
            ? [
                '-i', input,
                '-ss', seek,
                '-vframes', '1',
                '-s', '480x270', // Increased resolution slightly for quality
                '-y',
                output
            ]
            : [ // Photo resize
                '-i', input,
                '-vf', 'scale=400:-1',
                '-q:v', '5',
                '-y',
                output
            ];

        // Add auto-orient for photos just in case
        if (type === 'photo') {
            // FFmpeg thường tự handle orientation
        }

        const proc = spawn('ffmpeg', args, { stdio: 'ignore' });

        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve(code === 0);
        });

        proc.on('error', () => {
            clearTimeout(timer);
            resolve(false);
        });
    });
}

async function generatePreview(input, output, timeout) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeout);

        const args = [
            '-i', input,
            '-ss', '00:00:10', // Seek 10s
            '-t', '00:00:03',  // 3s duration
            '-vf', 'scale=320:-1:flags=lanczos',
            '-c:v', 'libx264',
            '-crf', '28',
            '-preset', 'veryfast',
            '-an',
            '-movflags', '+faststart',
            '-y',
            output
        ];

        const proc = spawn('ffmpeg', args, { stdio: 'ignore' });

        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve(code === 0);
        });

        proc.on('error', () => {
            clearTimeout(timer);
            resolve(false);
        });
    });
}

async function getMetadata(filePath, type, timeout) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve({}), timeout);
        ffmpeg.ffprobe(filePath, (err, data) => {
            clearTimeout(timer);
            if (err) resolve({});
            else {
                const video = data.streams.find(s => s.codec_type === 'video') || {};
                const audio = data.streams.find(s => s.codec_type === 'audio') || {};
                const format = data.format || {};

                let dateTaken = null;
                if (format.tags && format.tags.creation_time) dateTaken = format.tags.creation_time;

                // FPS Calculation
                let fps = 0;
                if (video.r_frame_rate) {
                    const parts = video.r_frame_rate.split('/');
                    if (parts.length === 2) fps = parseFloat(parts[0]) / parseFloat(parts[1]);
                    else fps = parseFloat(video.r_frame_rate);
                }

                resolve({
                    duration: format.duration || 0,
                    width: video.width,
                    height: video.height,
                    date_taken: dateTaken,
                    fps: fps || 0,
                    bitrate: format.bit_rate || 0,
                    codec_video: video.codec_name || '',
                    codec_audio: audio.codec_name || '',
                    rotation: (video.tags && video.tags.rotate) ? parseInt(video.tags.rotate) : 0,
                    audio_channels: audio.channels || 0,
                    sample_rate: audio.sample_rate || 0,
                    has_audio: !!audio.codec_name
                });
            }
        });
    });
}

// MAIN ENTRY
(async () => {
    try {
        const scanPaths = workerData.paths || [];
        parentPort.postMessage({ type: 'log', message: `🚀 Worker đang quét: ${scanPaths.join(', ')} (Videos & Photos)` });

        for (const scanPath of scanPaths) {
            if (isCancelled) break;

            if (!fs.existsSync(scanPath)) {
                parentPort.postMessage({ type: 'error', message: `Path not found: ${scanPath}` });
                continue;
            }

            const pathStats = fs.statSync(scanPath);

            if (pathStats.isDirectory()) {
                await walkDir(scanPath);
            } else if (pathStats.isFile()) {
                const ext = path.extname(scanPath).toLowerCase();
                if (VIDEO_EXTENSIONS.has(ext)) await processMedia(scanPath, path.basename(scanPath), 'video');
                else if (PHOTO_EXTENSIONS.has(ext)) await processMedia(scanPath, path.basename(scanPath), 'photo');
            }
        }

        parentPort.postMessage({ type: 'done', stats: stats });
    } catch (e) {
        parentPort.postMessage({ type: 'error', message: e.message });
    }
})();

parentPort.on('message', (msg) => { if (msg === 'STOP') isCancelled = true; });

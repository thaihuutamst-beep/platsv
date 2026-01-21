const { Worker } = require('worker_threads');
const path = require('path');
const dbCore = require('../core/database');
const env = require('../config/env');

class ScannerService {
    constructor() {
        this.worker = null;
        this.isScanning = false;
        this.io = null;
    }

    setSocket(io) { this.io = io; }

    async getScanPaths() {
        const db = await dbCore.connectDB();
        try {
            const setting = await db.get("SELECT value FROM settings WHERE key = 'scan_paths'");
            if (setting && setting.value) return JSON.parse(setting.value);
        } catch (e) { }
        return env.defaultScanPaths || [];
    }

    async startScan() {
        if (this.isScanning) return;
        this.isScanning = true;

        const paths = await this.getScanPaths();
        const db = await dbCore.connectDB();

        console.log("📡 Scanner Service: Starting...");
        if (this.io) this.io.emit('scan_start', { paths });

        this.worker = new Worker(path.join(__dirname, '../core/scanner.worker.js'), {
            workerData: { paths }
        });

        this.worker.on('message', async (msg) => {
            if (msg.type === 'heartbeat') {
                process.stdout.write(`\r💓 Scanning... Checked: ${msg.count} files...`);
            }
            else if (msg.type === 'log') {
                console.log(`\n[INFO] ${msg.message}`);
            }
            else if (msg.type === 'error') {
                console.error(`\n[ERROR] ${msg.message}`);
            }
            else if (msg.type === 'video_processed') {
                const v = msg.data;
                process.stdout.write(`\r🎥 Found: ${v.filename.substring(0, 40).padEnd(45)}`);

                try {
                    await db.run(`
                        INSERT INTO videos (
                            filename, path, size, duration, thumbnail_path, is_cloud, width, height,
                            fps, bitrate, codec_video, codec_audio, rotation, audio_channels, sample_rate, has_audio,
                            updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(path) DO UPDATE SET 
                            size=excluded.size, 
                            duration=excluded.duration,
                            thumbnail_path=excluded.thumbnail_path,
                            width=excluded.width,
                            height=excluded.height,
                            fps=excluded.fps,
                            bitrate=excluded.bitrate,
                            codec_video=excluded.codec_video,
                            codec_audio=excluded.codec_audio,
                            rotation=excluded.rotation,
                            audio_channels=excluded.audio_channels,
                            sample_rate=excluded.sample_rate,
                            has_audio=excluded.has_audio,
                            updated_at=CURRENT_TIMESTAMP
                    `, [
                        v.filename, v.path, v.size, v.duration, v.thumbnail_path, v.is_cloud, v.width, v.height,
                        v.fps, v.bitrate, v.codec_video, v.codec_audio, v.rotation, v.audio_channels, v.sample_rate, v.has_audio
                    ]);

                    if (this.io) {
                        this.io.emit('scan_progress', { file: v.filename });
                        // Gửi ngay video mới về client để hiện lên grid
                        const saved = await db.get("SELECT * FROM videos WHERE path = ?", v.path);
                        this.io.emit('video_found', saved);
                    }
                } catch (e) { console.error("\nDB Error:", e.message); }
            }
            else if (msg.type === 'photo_processed') {
                const p = msg.data;
                // Sanitize inputs to avoid undefined errors
                const dateTaken = p.date_taken || null;
                const width = p.width || 0;
                const height = p.height || 0;
                const size = p.size || 0;
                const thumbPath = p.thumbnail_path || '';

                process.stdout.write(`\r🖼️ Photo: ${p.filename.substring(0, 40).padEnd(45)}`);

                try {
                    await db.run(`
                        INSERT INTO photos (filename, path, size, width, height, date_taken, thumbnail_path, is_cloud, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(path) DO UPDATE SET 
                            size=excluded.size,
                            width=excluded.width,
                            height=excluded.height,
                            thumbnail_path=excluded.thumbnail_path,
                            updated_at=CURRENT_TIMESTAMP
                    `, [p.filename, p.path, size, width, height, dateTaken, thumbPath, p.is_cloud]);

                    if (this.io) {
                        this.io.emit('scan_progress', { file: p.filename });
                        // Also emit to update grid in real-time if needed
                        const saved = await db.get("SELECT * FROM photos WHERE path = ?", p.path);
                        if (saved) {
                            this.io.emit('photo_found', saved);
                        }
                    }
                } catch (e) {
                    console.error(`\n❌ DB Error (Photo): ${e.message}`);
                    console.error('Params:', { filename: p.filename, dateTaken, width, height });
                }
            }
            else if (msg.type === 'done') {
                console.log(`\n\n✅ QUÉT HOÀN TẤT!`);
                console.log(`   - Video tìm thấy: ${msg.stats.videosFound}`);
                console.log(`   - Thumb tạo mới: ${msg.stats.thumbsGenerated}`);
                console.log(`   - Thumb bỏ qua (đã có): ${msg.stats.thumbsSkipped}`);
                this.finishScan();
            }
        });

        this.worker.on('error', (err) => {
            console.error("\n❌ Worker Crash:", err);
            this.finishScan();
        });

        this.worker.on('exit', (code) => {
            if (code !== 0) console.error(`\nWorker stopped with exit code ${code}`);
            this.finishScan();
        });
    }

    stopScan() {
        if (this.worker) {
            this.worker.postMessage('STOP');
            setTimeout(() => {
                if (this.worker) this.worker.terminate();
                this.finishScan();
            }, 1000);
        }
    }

    finishScan() {
        this.isScanning = false;
        this.worker = null;
        if (this.io) this.io.emit('scan_complete', { status: 'done' });
    }

    getStatus() { return { isScanning: this.isScanning }; }
}

module.exports = new ScannerService();

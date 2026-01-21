const { spawn, exec } = require('child_process');
const path = require('path');
const net = require('net');
const { connectDB } = require('../core/database');

const MPV_PATH = path.resolve(__dirname, '../../../mpv/mpv.exe');
const IPC_PIPE = '\\\\.\\pipe\\mpv-socket'; // Windows Named Pipe

class MpvService {
    constructor() {
        this.io = null;
        this.mpvProcess = null;
        this.ipcClient = null;

        this.isPlaying = false;
        this.isPaused = false;
        this.queue = [];
        this.currentIndex = -1;
        this.current = null;
        this.volume = 100;
        this.position = 0;
        this.duration = 0;

        // Track stats
        this.currentSubs = [];
        this.currentAudio = [];

        // View state to preserve between tracks
        this.viewState = {
            zoom: 0,
            panX: 0,
            panY: 0,
            rotate: 0,
            aspect: '-1',        // -1 = auto
            speed: 1.0,
            fullscreen: true,
            windowX: null,
            windowY: null,
            windowWidth: null,
            windowHeight: null
        };
    }

    setSocket(io) {
        this.io = io;
    }

    getMpvPath() {
        const fs = require('fs');
        if (fs.existsSync(MPV_PATH)) return MPV_PATH;
        return 'mpv';
    }

    async getVideoById(id) {
        const db = await connectDB();
        return await db.get('SELECT * FROM videos WHERE id = ?', id);
    }

    async addToQueue(id) {
        const video = await this.getVideoById(id);
        if (!video) return { success: false, error: 'Video not found' };

        this.queue.push(video);
        if (this.queue.length === 1 && !this.isPlaying) {
            await this.playIndex(0);
        }
        this.broadcastStatus();
        return { success: true, video };
    }

    async play(id) {
        const video = await this.getVideoById(id);
        if (!video) return { success: false, error: 'Video not found' };
        this.queue = [video];
        await this.playIndex(0);
        return { success: true, video };
    }

    async playIndex(index) {
        if (index < 0 || index >= this.queue.length) return;

        this.currentIndex = index;
        this.current = this.queue[index];
        this.isPlaying = true;
        this.isPaused = false;

        const videoPath = this.current.path;

        // If MPV is already running, use loadfile replace to keep window state
        if (this.mpvProcess && this.ipcClient && this.ipcClient.writable) {
            console.log(`🔄 Switching track: ${this.current.filename}`);
            this.sendIpcCommand(['loadfile', videoPath, 'replace']);

            // Restore view state after file loads (small delay for file to start loading)
            setTimeout(() => this.restoreViewState(), 500);

            this.broadcastStatus();
            return { success: true };
        }

        // Otherwise spawn new MPV process
        const mpvPath = this.getMpvPath();
        console.log(`🎬 Starting MPV: ${this.current.filename}`);

        try {
            this.mpvProcess = spawn(mpvPath, [
                videoPath,
                '--fullscreen',
                '--volume=' + this.volume,
                '--osd-level=2',
                '--keep-open=no',
                '--title=DRAM Player - ' + this.current.filename,
                '--ontop',
                '--hwdec=auto',
                '--vo=gpu',
                '--profile=high-quality',
                '--audio-pitch-correction=yes',
                '--input-ipc-server=' + IPC_PIPE, // Enable IPC
                '--sub-auto=fuzzy',
            ], {
                stdio: ['ignore', 'ignore', 'ignore'],
                detached: false
            });

            // Wait a bit for pipe to be ready
            setTimeout(() => this.connectIPC(), 1000);

            this.mpvProcess.on('close', (code) => {
                console.log(`⏹️ MPV closed with code ${code}`);
                this.cleanup();
                if (code === 0 && this.currentIndex < this.queue.length - 1) {
                    setTimeout(() => this.playIndex(this.currentIndex + 1), 500);
                }
                this.broadcastStatus();
            });

        } catch (error) {
            console.error(`❌ Failed to start MPV: ${error.message}`);
            return { success: false, error: error.message };
        }

        this.broadcastStatus();
        return { success: true };
    }

    connectIPC() {
        if (this.ipcClient) this.ipcClient.destroy();

        this.ipcClient = net.connect(IPC_PIPE, () => {
            console.log('✅ IPC Connected');
            // Subscribe to events if needed
            this.sendIpcCommand(['observe_property', 1, 'percent-pos']);
            this.sendIpcCommand(['observe_property', 2, 'time-pos']);
            this.sendIpcCommand(['observe_property', 3, 'volume']);
        });

        this.ipcClient.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    if (msg.event === 'property-change') {
                        if (msg.name === 'volume') this.volume = msg.data;
                        if (msg.name === 'percent-pos') this.position = msg.data;
                        // Avoid spamming socket for position updates too often
                        // this.broadcastStatus(); 
                    }
                } catch (e) { }
            }
        });

        this.ipcClient.on('error', (err) => console.log('IPC Error:', err.message));
    }

    sendIpcCommand(commandArray) {
        if (!this.ipcClient || !this.ipcClient.writable) return;
        const payload = JSON.stringify({ command: commandArray }) + '\n';
        this.ipcClient.write(payload);
    }

    // Restore all view settings after track switch
    restoreViewState() {
        const vs = this.viewState;
        console.log('🔄 Restoring view state:', vs);

        // Restore zoom, pan, rotate
        if (vs.zoom !== 0) this.sendIpcCommand(['set', 'video-zoom', vs.zoom]);
        if (vs.panX !== 0) this.sendIpcCommand(['set', 'video-pan-x', vs.panX]);
        if (vs.panY !== 0) this.sendIpcCommand(['set', 'video-pan-y', vs.panY]);
        if (vs.rotate !== 0) this.sendIpcCommand(['set', 'video-rotate', vs.rotate]);

        // Restore aspect ratio
        if (vs.aspect !== '-1') this.sendIpcCommand(['set', 'video-aspect-override', vs.aspect]);

        // Restore speed
        if (vs.speed !== 1.0) this.sendIpcCommand(['set', 'speed', vs.speed]);

        // Fullscreen state (less critical since loadfile replace usually preserves it)
        // this.sendIpcCommand(['set', 'fullscreen', vs.fullscreen ? 'yes' : 'no']);
    }

    cleanup() {
        this.isPlaying = false;
        this.isPaused = false;
        this.mpvProcess = null;
        if (this.ipcClient) {
            this.ipcClient.destroy();
            this.ipcClient = null;
        }
    }

    stop() {
        if (this.mpvProcess) {
            this.mpvProcess.kill();
        }
        this.cleanup();
        this.current = null;
        this.broadcastStatus();
    }

    next() {
        if (this.currentIndex < this.queue.length - 1) this.playIndex(this.currentIndex + 1);
    }

    prev() {
        if (this.currentIndex > 0) this.playIndex(this.currentIndex - 1);
    }

    // --- ADVANCED COMMANDS ---

    command(action, value = null) {
        switch (action) {
            case 'play_pause':
                this.isPaused = !this.isPaused;
                this.sendIpcCommand(['cycle', 'pause']);
                break;
            case 'stop': this.stop(); break;
            case 'next': this.next(); break;
            case 'prev': this.prev(); break;
            case 'volume':
                if (value !== null) {
                    this.volume = value;
                    this.sendIpcCommand(['set', 'volume', value]);
                }
                break;
            case 'volume_up':
                this.volume = Math.min(130, this.volume + 5);
                this.sendIpcCommand(['set', 'volume', this.volume]);
                break;
            case 'volume_down':
                this.volume = Math.max(0, this.volume - 5);
                this.sendIpcCommand(['set', 'volume', this.volume]);
                break;

            // Advanced
            case 'cycle_sub': this.sendIpcCommand(['cycle', 'sub']); break;
            case 'cycle_audio': this.sendIpcCommand(['cycle', 'audio']); break;
            case 'speed':
                if (value) {
                    this.viewState.speed = parseFloat(value);
                    this.sendIpcCommand(['set', 'speed', this.viewState.speed]);
                }
                break;
            case 'aspect':
                if (value) {
                    this.viewState.aspect = value;
                    this.sendIpcCommand(['set', 'video-aspect-override', value]);
                }
                break;

            // Visual Controls - Zoom/Pan/Rotate (SAVE STATE)
            case 'zoom':
                if (value !== null) {
                    this.viewState.zoom = parseFloat(value);
                    this.sendIpcCommand(['set', 'video-zoom', this.viewState.zoom]);
                }
                break;
            case 'pan_x':
                if (value !== null) {
                    this.viewState.panX = parseFloat(value);
                    this.sendIpcCommand(['set', 'video-pan-x', this.viewState.panX]);
                }
                break;
            case 'pan_y':
                if (value !== null) {
                    this.viewState.panY = parseFloat(value);
                    this.sendIpcCommand(['set', 'video-pan-y', this.viewState.panY]);
                }
                break;
            case 'rotate':
                if (value !== null) {
                    this.viewState.rotate = parseInt(value);
                    this.sendIpcCommand(['set', 'video-rotate', this.viewState.rotate]);
                }
                break;
            case 'reset_view':
                // Reset all view settings to default AND clear saved state
                this.viewState.zoom = 0;
                this.viewState.panX = 0;
                this.viewState.panY = 0;
                this.viewState.rotate = 0;
                this.viewState.aspect = '-1';
                this.sendIpcCommand(['set', 'video-zoom', 0]);
                this.sendIpcCommand(['set', 'video-pan-x', 0]);
                this.sendIpcCommand(['set', 'video-pan-y', 0]);
                this.sendIpcCommand(['set', 'video-rotate', 0]);
                this.sendIpcCommand(['set', 'video-aspect-override', '-1']);
                break;
        }
        this.broadcastStatus();
    }

    clearQueue() { this.stop(); this.queue = []; this.currentIndex = -1; this.broadcastStatus(); }

    removeFromQueue(index) {
        if (index >= 0 && index < this.queue.length) {
            this.queue.splice(index, 1);
            if (index === this.currentIndex) this.stop(); // If current, stop
            this.broadcastStatus();
        }
    }

    getStatus() {
        return {
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            current: this.current,
            currentIndex: this.currentIndex,
            queue: this.queue,
            volume: this.volume,
            position: this.position,
            duration: this.duration,
            mpvAvailable: true // Assume true for now
        };
    }

    broadcastStatus() {
        if (this.io) this.io.emit('mpv_status', this.getStatus());
    }
}

module.exports = new MpvService();

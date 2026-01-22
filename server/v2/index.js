const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require("socket.io");
const env = require('./config/env');
const schema = require('./core/schema');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Static Files
app.use(express.static(path.resolve(__dirname, '../../client/public')));
app.use('/thumbnails', express.static(path.resolve(__dirname, '../../data/thumbnails')));

async function startServer() {
    console.log("⏳ DRAM System Booting...");

    // 1. Database Check
    const dbStatus = await schema.verifyAndMigrate();
    if (!dbStatus.success) {
        console.error("❌ Database Init Failed. Exiting.");
        process.exit(1);
    }

    // 2. Inject Socket & Services
    const scannerService = require('./services/scanner.service');
    scannerService.setSocket(io);

    const mpvService = require('./services/mpv.service');
    mpvService.setSocket(io);

    const diagnosticService = require('./services/diagnostic.service');
    diagnosticService.setSocket(io);

    // 3. Register Routes
    app.use('/api/v2/scanner', require('./routes/scanner.routes'));
    app.use('/api/videos', require('./routes/video.routes'));
    app.use('/api/mpv', require('./routes/mpv.routes'));
    app.use('/api/settings', require('./routes/settings.routes'));
    app.use('/api/diagnostic', require('./routes/diagnostic.routes'));
    app.use('/api/photos', require('./routes/photos.routes'));
    app.use('/api/playlists', require('./routes/playlist.routes'));
    app.use('/api/v2/system', require('./routes/system.routes'));
    app.use('/api/v2/ytdlp', require('./routes/ytdlp.routes'));

    // 4. Network Info
    app.get('/api/network-info', (req, res) => {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        let ip = 'localhost';
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) { ip = net.address; break; }
            }
        }
        res.json({ url: `http://${ip}:${env.port}` });
    });

    // 5. Socket Events
    io.on('connection', (socket) => {
        // --- SỬA LỖI TẠI ĐÂY ---
        socket.on('mpv_play', async (id) => {
            const mpv = require('./services/mpv.service');
            // Logic mới: gọi trực tiếp play()
            mpv.play(id);
        });

        // Chuyển tiếp lệnh control (nếu cần)
        socket.on('mpv_command', (data) => {
            // Logic mở rộng sau này
        });
    });

    // 6. Start Listening
    server.listen(env.port, () => {
        console.log(`===========================================`);
        console.log(`🚀 DRAM PLAYSV v5.0 ULTIMATE READY`);
        console.log(`👉 Server Port: ${env.port}`);
        console.log(`👉 Environment: ${env.platform.toUpperCase()}`);
        console.log(`===========================================`);
    });
}

startServer();

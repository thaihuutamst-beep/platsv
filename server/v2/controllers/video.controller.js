const { connectDB } = require('../core/database');
const fs = require('fs');

exports.getAllVideos = async (req, res) => {
    try {
        const db = await connectDB();
        // GROUP BY v.id để chống trùng lặp
        const videos = await db.all(`
            SELECT v.*, ph.progress, ph.position 
            FROM videos v 
            LEFT JOIN playback_history ph ON v.id = ph.video_id 
            GROUP BY v.id
            ORDER BY v.updated_at DESC
        `);
        res.json(videos);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getContinueWatching = async (req, res) => {
    try {
        const db = await connectDB();
        // GROUP BY v.id chống trùng lặp
        const videos = await db.all(`
            SELECT v.*, ph.progress, ph.position
            FROM videos v
            INNER JOIN playback_history ph ON v.id = ph.video_id
            WHERE ph.progress > 5 AND ph.progress < 95
            GROUP BY v.id
            ORDER BY ph.updated_at DESC LIMIT 10
        `);
        res.json(videos);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getPlayback = async (req, res) => {
    try {
        const db = await connectDB();
        const row = await db.get('SELECT position, progress FROM playback_history WHERE video_id = ?', req.params.id);
        res.json(row || { position: 0 });
    } catch (e) { res.json({ position: 0 }); }
};

exports.savePlayback = async (req, res) => {
    try {
        const { position, duration } = req.body;
        const videoId = req.params.id;
        if (!duration) return res.json({ success: false });

        const progress = (duration > 0) ? (position / duration) * 100 : 0;
        const db = await connectDB();

        await db.run(`
            INSERT INTO playback_history (video_id, position, duration, progress, updated_at) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(video_id) DO UPDATE SET 
                position=excluded.position,
                duration=excluded.duration,
                progress=excluded.progress,
                updated_at=CURRENT_TIMESTAMP
        `, [videoId, position, duration, progress]);

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.streamVideo = async (req, res) => {
    try {
        const db = await connectDB();
        const video = await db.get('SELECT path FROM videos WHERE id = ?', req.params.id);
        if (!video || !fs.existsSync(video.path)) return res.status(404).send('File not found');

        const stat = fs.statSync(video.path);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(video.path, { start, end });
            res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/mp4' });
            file.pipe(res);
        } else {
            res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
            fs.createReadStream(video.path).pipe(res);
        }
    } catch (e) { if (!res.headersSent) res.status(500).end(); }
};

exports.toggleFavorite = async (req, res) => {
    try {
        const { id } = req.params;
        const db = await connectDB();
        const video = await db.get('SELECT is_favorite FROM videos WHERE id = ?', id);
        if (!video) return res.status(404).json({ error: 'Not found' });

        const newValue = video.is_favorite ? 0 : 1;
        await db.run('UPDATE videos SET is_favorite = ? WHERE id = ?', [newValue, id]);
        res.json({ success: true, is_favorite: newValue });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

exports.updateMetadata = async (req, res) => {
    try {
        const { id } = req.params;
        const { tags, notes } = req.body;
        const db = await connectDB();
        await db.run('UPDATE videos SET tags = ?, notes = ? WHERE id = ?', [tags, notes, id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

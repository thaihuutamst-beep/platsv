const express = require('express');
const router = express.Router();
const diagnosticService = require('../services/diagnostic.service');
const { connectDB } = require('../core/database');

// Diagnose single video
router.get('/video/:id', async (req, res) => {
    try {
        const result = await diagnosticService.diagnoseVideo(parseInt(req.params.id));
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Diagnose all videos
router.post('/scan-all', async (req, res) => {
    try {
        res.json({ message: 'Diagnostic scan started', status: 'running' });
        // Run in background
        diagnosticService.diagnoseAllVideos();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get problematic videos
router.get('/problems', async (req, res) => {
    try {
        const problems = await diagnosticService.getProblematicVideos();
        res.json({
            count: problems.length,
            videos: problems
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get video with full metadata
router.get('/metadata/:id', async (req, res) => {
    try {
        const db = await connectDB();
        const video = await db.get(`
            SELECT 
                id, filename, path, size, duration, thumbnail_path,
                width, height, fps, bitrate, codec_video, codec_audio, format,
                rotation, has_audio, audio_channels, sample_rate,
                status, error_message, is_corrupt, is_empty, is_cloud,
                file_created_at, file_modified_at, scanned_at,
                is_favorite, rating, tags, notes,
                created_at, updated_at
            FROM videos WHERE id = ?
        `, req.params.id);

        if (!video) {
            return res.status(404).json({ error: 'Video not found' });
        }

        res.json(video);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rescan problematic videos
router.post('/rescan-problems', async (req, res) => {
    try {
        const result = await diagnosticService.rescanProblematic();
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get health summary
router.get('/health', async (req, res) => {
    try {
        const db = await connectDB();

        const total = await db.get("SELECT COUNT(*) as count FROM videos");
        const ok = await db.get("SELECT COUNT(*) as count FROM videos WHERE status = 'ok' OR status IS NULL");
        const corrupt = await db.get("SELECT COUNT(*) as count FROM videos WHERE is_corrupt = 1");
        const empty = await db.get("SELECT COUNT(*) as count FROM videos WHERE is_empty = 1");
        const missing = await db.get("SELECT COUNT(*) as count FROM videos WHERE status = 'missing'");
        const noDuration = await db.get("SELECT COUNT(*) as count FROM videos WHERE status = 'no_duration'");
        const cloud = await db.get("SELECT COUNT(*) as count FROM videos WHERE is_cloud = 1");
        const hasMetadata = await db.get("SELECT COUNT(*) as count FROM videos WHERE width > 0");

        res.json({
            total: total.count,
            healthy: ok.count,
            corrupt: corrupt.count,
            empty: empty.count,
            missing: missing.count,
            noDuration: noDuration.count,
            cloud: cloud.count,
            hasMetadata: hasMetadata.count,
            healthPercent: total.count > 0 ? Math.round((ok.count / total.count) * 100) : 0
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Quick probe without saving to DB
router.get('/probe', async (req, res) => {
    try {
        const { path } = req.query;
        if (!path) {
            return res.status(400).json({ error: 'path query parameter required' });
        }

        const metadata = await diagnosticService.getVideoMetadata(path);
        res.json(metadata);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

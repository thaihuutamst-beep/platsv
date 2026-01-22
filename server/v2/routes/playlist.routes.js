const express = require('express');
const router = express.Router();
const playlistService = require('../services/playlist.service');

// Get all playlists
router.get('/', async (req, res) => {
    try {
        const playlists = await playlistService.getAll();
        res.json(playlists);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create playlist
router.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Name is required" });
        const result = await playlistService.create(name);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get playlist details (with videos)
router.get('/:id', async (req, res) => {
    try {
        const playlist = await playlistService.getById(req.params.id);
        const videos = await playlistService.getPlaylistVideos(req.params.id);
        res.json({ ...playlist, videos });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete playlist
router.delete('/:id', async (req, res) => {
    try {
        await playlistService.delete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add items to playlist
router.post('/:id/items', async (req, res) => {
    try {
        const { videoIds } = req.body; // Array of IDs
        if (!Array.isArray(videoIds)) return res.status(400).json({ error: "videoIds must be an array" });

        const result = await playlistService.addItems(req.params.id, videoIds);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Remove items from playlist
router.delete('/:id/items', async (req, res) => {
    try {
        const { videoIds } = req.body;
        if (!Array.isArray(videoIds)) return res.status(400).json({ error: "videoIds must be an array" });

        const result = await playlistService.removeItems(req.params.id, videoIds);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

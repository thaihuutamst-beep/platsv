const photoService = require('../services/photos.service');
const path = require('path');
const fs = require('fs');

exports.list = async (req, res) => {
    try {
        const { limit, offset, sort } = req.query;
        const result = await photoService.getAll({
            limit: parseInt(limit) || 50,
            offset: parseInt(offset) || 0,
            sort
        });
        res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getThumbnail = async (req, res) => {
    try {
        const photo = await photoService.getById(req.params.id);
        if (!photo) return res.status(404).send('Not found');

        // Check if thumbnail exists
        if (photo.thumbnail_path) {
            const thumbPath = path.resolve(__dirname, '../../../data', photo.thumbnail_path);
            if (fs.existsSync(thumbPath)) {
                return res.sendFile(thumbPath);
            }
        }

        // Fallback: Send original if no thumb (browsers can resize, but slow)
        // Better trigger generation on fly? For now just send original.
        res.sendFile(photo.path);
    } catch (e) { res.status(500).send(e.message); }
};

exports.view = async (req, res) => {
    try {
        const photo = await photoService.getById(req.params.id);
        if (!photo) return res.status(404).send('Not found');
        res.sendFile(photo.path);
    } catch (e) { res.status(500).send(e.message); }
};

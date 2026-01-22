const express = require('express');
const router = express.Router();
const systemService = require('../services/system.service');

// Get content (Drives or Directory)
router.get('/drives', async (req, res) => {
    try {
        const drives = await systemService.getDrives();
        res.json({ drives });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/browse', async (req, res) => {
    try {
        const targetPath = req.query.path;

        if (!targetPath || targetPath === 'root') {
            const drives = await systemService.getDrives();
            res.json({
                current: 'root',
                parent: null,
                items: drives
            });
        } else {
            const contents = await systemService.getDirectoryContents(targetPath);
            res.json(contents);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

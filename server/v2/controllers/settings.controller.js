const { connectDB } = require('../core/database');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

// Get all settings
exports.getAllSettings = async (req, res) => {
    try {
        const db = await connectDB();
        const settings = await db.all("SELECT * FROM settings");

        // Convert to object
        const result = {};
        settings.forEach(s => {
            try { result[s.key] = JSON.parse(s.value); }
            catch { result[s.key] = s.value; }
        });

        // Include defaults if not set
        if (!result.scan_paths) {
            result.scan_paths = env.defaultScanPaths;
        }

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Get scan paths
exports.getScanPaths = async (req, res) => {
    try {
        const db = await connectDB();
        const setting = await db.get("SELECT value FROM settings WHERE key = 'scan_paths'");

        let paths = env.defaultScanPaths;
        if (setting && setting.value) {
            try { paths = JSON.parse(setting.value); } catch { }
        }

        // Add existence info for each path
        const result = paths.map(p => ({
            path: p,
            exists: fs.existsSync(p),
            isCloud: p.toLowerCase().includes('onedrive') ||
                p.toLowerCase().includes('google drive') ||
                p.toLowerCase().includes('dropbox')
        }));

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Update scan paths
exports.updateScanPaths = async (req, res) => {
    try {
        const { paths } = req.body;

        if (!Array.isArray(paths)) {
            return res.status(400).json({ error: 'paths must be an array' });
        }

        // Validate paths exist
        const validPaths = paths.filter(p => {
            const normalized = path.resolve(p);
            return fs.existsSync(normalized);
        });

        const db = await connectDB();
        await db.run(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('scan_paths', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET 
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        `, [JSON.stringify(validPaths)]);

        res.json({
            success: true,
            paths: validPaths,
            invalidPaths: paths.filter(p => !validPaths.includes(p))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Add single path (file or directory)
exports.addScanPath = async (req, res) => {
    try {
        const { path: newPath } = req.body;

        if (!newPath) {
            return res.status(400).json({ error: 'path is required' });
        }

        const normalized = path.resolve(newPath);
        if (!fs.existsSync(normalized)) {
            return res.status(400).json({ error: 'Path does not exist', path: normalized });
        }

        // Detect if file or directory
        const stats = fs.statSync(normalized);
        const isFile = stats.isFile();
        const isDirectory = stats.isDirectory();

        // Validate file type if it's a file
        const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
        if (isFile) {
            const ext = path.extname(normalized).toLowerCase();
            if (!VIDEO_EXTENSIONS.includes(ext)) {
                return res.status(400).json({
                    error: 'File type not supported',
                    path: normalized,
                    supportedTypes: VIDEO_EXTENSIONS
                });
            }
        }

        const db = await connectDB();
        const setting = await db.get("SELECT value FROM settings WHERE key = 'scan_paths'");

        let paths = [];
        if (setting && setting.value) {
            try { paths = JSON.parse(setting.value); } catch { }
        } else {
            paths = [...env.defaultScanPaths];
        }

        // Avoid duplicates
        if (!paths.includes(normalized)) {
            paths.push(normalized);
        }

        await db.run(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('scan_paths', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET 
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        `, [JSON.stringify(paths)]);

        res.json({
            success: true,
            paths,
            addedPath: {
                path: normalized,
                isFile,
                isDirectory
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Remove single path (with optional DB cleanup)
exports.removeScanPath = async (req, res) => {
    try {
        const { path: removePath, deleteVideos = true } = req.body;

        if (!removePath) {
            return res.status(400).json({ error: 'path is required' });
        }

        const db = await connectDB();
        const setting = await db.get("SELECT value FROM settings WHERE key = 'scan_paths'");

        let paths = [];
        if (setting && setting.value) {
            try { paths = JSON.parse(setting.value); } catch { }
        }

        // Remove path from list
        const normalized = path.resolve(removePath);
        paths = paths.filter(p => path.resolve(p) !== normalized);

        await db.run(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES ('scan_paths', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET 
                value = excluded.value,
                updated_at = CURRENT_TIMESTAMP
        `, [JSON.stringify(paths)]);

        // Optionally delete videos from this path
        let deletedCount = 0;
        if (deleteVideos) {
            // Delete videos where path starts with the removed scan path
            const result = await db.run(
                "DELETE FROM videos WHERE path LIKE ?",
                [`${normalized}%`]
            );
            deletedCount = result.changes || 0;

            // Also clean up playback history for deleted videos
            await db.run("DELETE FROM playback_history WHERE video_id NOT IN (SELECT id FROM videos)");
        }

        res.json({
            success: true,
            paths,
            deletedVideos: deletedCount
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Get library stats
exports.getStats = async (req, res) => {
    try {
        const db = await connectDB();

        const videoCount = await db.get("SELECT COUNT(*) as count FROM videos");
        const totalSize = await db.get("SELECT SUM(size) as total FROM videos");
        const cloudCount = await db.get("SELECT COUNT(*) as count FROM videos WHERE is_cloud = 1");

        res.json({
            totalVideos: videoCount?.count || 0,
            totalSize: totalSize?.total || 0,
            cloudVideos: cloudCount?.count || 0
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Reset to defaults
exports.resetSettings = async (req, res) => {
    try {
        const db = await connectDB();
        await db.run("DELETE FROM settings");
        res.json({ success: true, message: 'Settings reset to defaults' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

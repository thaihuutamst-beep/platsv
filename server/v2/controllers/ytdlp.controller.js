/**
 * YT-DLP Controller
 * API endpoints for URL resolution and cookies settings
 */
const ytdlpService = require('../services/ytdlp.service');

// Get current cookies browser setting
exports.getCookiesBrowser = (req, res) => {
    res.json({ browser: ytdlpService.getCookiesBrowser() });
};

// Set cookies browser
exports.setCookiesBrowser = async (req, res) => {
    const { browser } = req.body;
    if (!browser) return res.status(400).json({ error: 'Browser is required' });

    const result = await ytdlpService.setCookiesBrowser(browser);
    res.json(result);
};

// Resolve URL to direct stream
exports.resolveUrl = async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const result = await ytdlpService.resolveUrl(url);
    res.json(result);
};

// Get metadata from URL
exports.getMetadata = async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const result = await ytdlpService.getMetadata(url);
    res.json(result);
};

// Import URL with optional resolution
exports.importUrl = async (req, res) => {
    const { url, resolve } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const result = await ytdlpService.importUrl(url, resolve === true);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

// Re-resolve an expired URL
exports.reResolve = async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Video ID is required' });

    const result = await ytdlpService.reResolve(parseInt(id));
    res.json(result);
};

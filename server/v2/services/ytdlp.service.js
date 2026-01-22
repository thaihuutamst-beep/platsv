/**
 * YT-DLP Service
 * Handles URL resolution, stream extraction, and browser cookies integration
 */
const { exec, spawn } = require('child_process');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs');
const { connectDB } = require('../core/database');

// yt-dlp path (expected in mpv folder or system PATH)
const YTDLP_PATH = path.resolve(__dirname, '../../../mpv/yt-dlp.exe');
const YTDLP_FALLBACK = 'yt-dlp'; // Use system PATH if not found

class YtdlpService {
    constructor() {
        // Browser to use for cookies (chrome, firefox, edge, opera, brave, chromium, vivaldi, safari)
        this.cookiesBrowser = 'chrome';
        this.loadSettings();
    }

    async loadSettings() {
        try {
            const db = await connectDB();
            const row = await db.get("SELECT value FROM settings WHERE key = 'ytdlp_cookies_browser'");
            if (row) this.cookiesBrowser = row.value;
        } catch (e) {
            // Settings table might not exist, use default
        }
    }

    async setCookiesBrowser(browser) {
        const validBrowsers = ['chrome', 'firefox', 'edge', 'opera', 'brave', 'chromium', 'vivaldi', 'safari', 'none'];
        if (!validBrowsers.includes(browser)) {
            return { success: false, error: `Invalid browser. Valid options: ${validBrowsers.join(', ')}` };
        }

        this.cookiesBrowser = browser;

        try {
            const db = await connectDB();
            await db.run(`
                INSERT INTO settings (key, value) VALUES ('ytdlp_cookies_browser', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `, browser);
            return { success: true, browser };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    getCookiesBrowser() {
        return this.cookiesBrowser;
    }

    getYtdlpPath() {
        if (fs.existsSync(YTDLP_PATH)) return YTDLP_PATH;
        return YTDLP_FALLBACK;
    }

    /**
     * Get direct stream URL from a platform URL (YouTube, Facebook, etc.)
     * @param {string} url - The original URL
     * @returns {Promise<{success: boolean, resolved_url?: string, title?: string, duration?: number, error?: string}>}
     */
    async resolveUrl(url) {
        const ytdlp = this.getYtdlpPath();
        const args = [
            '-g',           // Get URL only
            '-f', 'best',   // Best quality
            '--no-warnings',
            url
        ];

        // Add cookies if configured
        if (this.cookiesBrowser && this.cookiesBrowser !== 'none') {
            args.unshift('--cookies-from-browser', this.cookiesBrowser);
        }

        try {
            const { stdout, stderr } = await execAsync(`"${ytdlp}" ${args.join(' ')}`, {
                timeout: 60000 // 60 second timeout
            });

            const resolvedUrl = stdout.trim().split('\n')[0]; // Get first URL (video, not audio)
            if (!resolvedUrl) {
                return { success: false, error: 'Could not extract URL' };
            }

            return {
                success: true,
                resolved_url: resolvedUrl,
                resolved_at: new Date().toISOString()
            };
        } catch (e) {
            console.error('yt-dlp error:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * Get full metadata from URL
     * @param {string} url - The source URL
     * @returns {Promise<Object>}
     */
    async getMetadata(url) {
        const ytdlp = this.getYtdlpPath();
        const args = [
            '-j',           // JSON output
            '--no-download',
            '--no-warnings',
            url
        ];

        if (this.cookiesBrowser && this.cookiesBrowser !== 'none') {
            args.unshift('--cookies-from-browser', this.cookiesBrowser);
        }

        try {
            const { stdout } = await execAsync(`"${ytdlp}" ${args.join(' ')}`, {
                timeout: 60000,
                maxBuffer: 10 * 1024 * 1024 // 10MB for large metadata
            });

            const metadata = JSON.parse(stdout);
            return {
                success: true,
                title: metadata.title || metadata.fulltitle,
                duration: metadata.duration || 0,
                thumbnail: metadata.thumbnail,
                description: metadata.description,
                uploader: metadata.uploader,
                upload_date: metadata.upload_date,
                view_count: metadata.view_count,
                formats: metadata.formats?.length || 0
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Import URL into database with optional resolution
     * @param {string} originalUrl - The source URL
     * @param {boolean} resolve - Whether to resolve to direct URL
     */
    async importUrl(originalUrl, resolve = false) {
        const db = await connectDB();

        // Check if already exists
        let existing = await db.get('SELECT * FROM videos WHERE path = ? OR original_url = ?', [originalUrl, originalUrl]);
        if (existing) {
            return { success: true, id: existing.id, exists: true };
        }

        let resolvedUrl = null;
        let resolvedAt = null;
        let title = originalUrl;
        let duration = 0;

        // Optionally resolve
        if (resolve) {
            const resolution = await this.resolveUrl(originalUrl);
            if (resolution.success) {
                resolvedUrl = resolution.resolved_url;
                resolvedAt = resolution.resolved_at;
            }

            // Get metadata for title
            const meta = await this.getMetadata(originalUrl);
            if (meta.success) {
                title = meta.title || originalUrl;
                duration = meta.duration || 0;
            }
        }

        // Insert to DB
        const result = await db.run(`
            INSERT INTO videos (filename, path, original_url, resolved_url, resolved_at, size, duration, created_at, updated_at, is_cloud, mediaType)
            VALUES (?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, 'video')
        `, [title, resolvedUrl || originalUrl, originalUrl, resolvedUrl, resolvedAt, duration]);

        return {
            success: true,
            id: result.lastID,
            original_url: originalUrl,
            resolved_url: resolvedUrl,
            title
        };
    }

    /**
     * Re-resolve an expired URL
     * @param {number} videoId - Video ID in database
     */
    async reResolve(videoId) {
        const db = await connectDB();
        const video = await db.get('SELECT * FROM videos WHERE id = ?', videoId);

        if (!video || !video.original_url) {
            return { success: false, error: 'Video not found or no original URL' };
        }

        const resolution = await this.resolveUrl(video.original_url);
        if (!resolution.success) {
            return resolution;
        }

        await db.run(`
            UPDATE videos SET 
                path = ?, 
                resolved_url = ?, 
                resolved_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [resolution.resolved_url, resolution.resolved_url, resolution.resolved_at, videoId]);

        return {
            success: true,
            id: videoId,
            resolved_url: resolution.resolved_url,
            resolved_at: resolution.resolved_at
        };
    }

    /**
     * Get cookies flag for MPV command
     * @returns {string[]} Array of args to pass to MPV/yt-dlp
     */
    getMpvCookiesArgs() {
        if (this.cookiesBrowser && this.cookiesBrowser !== 'none') {
            return ['--ytdl-raw-options=cookies-from-browser=' + this.cookiesBrowser];
        }
        return [];
    }
}

module.exports = new YtdlpService();

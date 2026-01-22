/**
 * YT-DLP Routes
 */
const express = require('express');
const router = express.Router();
const ytdlp = require('../controllers/ytdlp.controller');

// Cookies browser settings
router.get('/cookies-browser', ytdlp.getCookiesBrowser);
router.post('/cookies-browser', ytdlp.setCookiesBrowser);

// URL operations
router.post('/resolve', ytdlp.resolveUrl);
router.post('/metadata', ytdlp.getMetadata);
router.post('/import', ytdlp.importUrl);
router.post('/re-resolve/:id', ytdlp.reResolve);

module.exports = router;

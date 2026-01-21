const express = require('express');
const router = express.Router();
const controller = require('../controllers/video.controller');

router.get('/', controller.getAllVideos);
router.get('/continue', controller.getContinueWatching);
router.get('/:id/playback', controller.getPlayback);
router.post('/:id/playback', controller.savePlayback);
router.get('/:id/stream', controller.streamVideo);

router.post('/:id/favorite', controller.toggleFavorite);
router.post('/:id/metadata', controller.updateMetadata);

module.exports = router;

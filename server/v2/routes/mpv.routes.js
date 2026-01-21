const express = require('express');
const router = express.Router();
const controller = require('../controllers/mpv.controller');
router.post('/play', controller.play);
router.post('/queue', controller.queueAdd);
router.post('/command', controller.command);
router.get('/status', controller.getStatus);
module.exports = router;

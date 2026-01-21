const express = require('express');
const router = express.Router();
const controller = require('../controllers/scanner.controller');

router.post('/start', controller.startScan);
router.post('/stop', controller.stopScan);
router.get('/status', controller.getStatus);
router.post('/config', controller.updateConfig);

module.exports = router;

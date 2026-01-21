const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');

// GET /api/settings - Get all settings
router.get('/', settingsController.getAllSettings);

// GET /api/settings/scan-paths - Get scan paths with status
router.get('/scan-paths', settingsController.getScanPaths);

// PUT /api/settings/scan-paths - Replace all scan paths
router.put('/scan-paths', settingsController.updateScanPaths);

// POST /api/settings/scan-paths/add - Add single path
router.post('/scan-paths/add', settingsController.addScanPath);

// POST /api/settings/scan-paths/remove - Remove single path
router.post('/scan-paths/remove', settingsController.removeScanPath);

// GET /api/settings/stats - Get library statistics
router.get('/stats', settingsController.getStats);

// DELETE /api/settings/reset - Reset all settings
router.delete('/reset', settingsController.resetSettings);

module.exports = router;

const express = require('express');
const router = express.Router();
const controller = require('../controllers/photos.controller');

router.get('/', controller.list);
router.get('/:id/thumb', controller.getThumbnail);
router.get('/:id/view', controller.view);
router.post('/:id/rotate', controller.rotate);

module.exports = router;

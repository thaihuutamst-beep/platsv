const express = require('express');
const router = express.Router();
const controller = require('../controllers/photos.controller');

router.get('/', controller.list);
router.get('/:id/thumb', controller.getThumbnail);
router.get('/:id/view', controller.view);

module.exports = router;

const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware.js');
const documentController = require('../controllers/document.controller.js');
const { upload } = require('../middlewares/upload.middleware.js');
const router = express.Router();

router.post('/:id/share', authMiddleware, documentController.share);
router.delete('/:id', authMiddleware, documentController.remove);
router.post('/upload', authMiddleware, upload.single('file'), documentController.upload);
router.get('/', authMiddleware, documentController.list);
router.get('/download/:id', authMiddleware, documentController.download);

module.exports = router;

const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middlewares/auth.middleware.js');
const documentController = require('../controllers/document.controller.js');
const router = express.Router();
const uploader = multer({ dest: 'storage/' });

router.post('/:id/share', authMiddleware, documentController.share);
router.delete('/:id', authMiddleware, documentController.remove);
router.post('/upload', authMiddleware, uploader.single('file'), documentController.upload);
router.get('/', authMiddleware, documentController.list);
router.get('/download/:id', authMiddleware, documentController.download);

module.exports = router;

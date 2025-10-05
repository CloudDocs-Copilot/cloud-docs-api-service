const express = require('express');
const folderController = require('../controllers/folder.controller.js');
const authMiddleware = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.post('/', authMiddleware, folderController.create);
router.get('/', authMiddleware, folderController.list);
router.delete('/:id', authMiddleware, folderController.remove);
router.patch('/:id', authMiddleware, folderController.rename);

module.exports = router;

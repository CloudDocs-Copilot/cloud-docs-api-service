const express = require('express');
const folderController = require('../controllers/folder.controller.js');
const authMiddleware = require('../middlewares/auth.middleware.js');

const router = express.Router();

router.post('/', authMiddleware, folderController.create);
router.get('/', authMiddleware, folderController.list);

module.exports = router;

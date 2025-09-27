import express from 'express';
import Folder from '../models/folder.js';
import authMiddleware from '../services/authMiddleware.js';

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const folder = await Folder.create({ name, owner: req.user.id });
    res.status(201).json(folder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  const folders = await Folder.find({ owner: req.user.id }).populate('documents');
  res.json(folders);
});

export default router;
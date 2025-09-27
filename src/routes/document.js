
import express from 'express';
import multer from 'multer';
import Document from '../models/document.js';
import Folder from '../models/folder.js';
import authMiddleware from '../services/authMiddleware.js';
import fs from 'fs';
const router = express.Router();
const upload = multer({ dest: 'storage/' });

// Compartir documento con otros usuarios
router.post('/:id/share', authMiddleware, async (req, res) => {
  try {
    const { userIds } = req.body; // Array de IDs de usuarios con quienes compartir
    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { sharedWith: { $each: userIds } } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
    res.json({ message: 'Documento compartido', doc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar documento por ID
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    // Elimina el archivo físico
    const filePath = `storage/${doc.filename}`;
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error al eliminar archivo:', err);
    });

    res.json({ message: 'Documento eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { folderId } = req.body;
    const doc = await Document.create({
      filename: req.file.filename,
      originalname: req.file.originalname,
      url: `/storage/${req.file.filename}`,
      uploadedBy: req.user.id,
      folder: folderId
    });
    if (folderId) {
      await Folder.findByIdAndUpdate(folderId, { $push: { documents: doc._id } });
    }
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


router.get('/', authMiddleware, async (req, res) => {
  const docs = await Document.find({ uploadedBy: req.user.id }).populate('folder');
  res.json(docs);
});

// Descargar documento por ID
router.get('/download/:id', authMiddleware, async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

  const filePath = `storage/${doc.filename}`;
  console.log('Descargando:', filePath);
  res.download(filePath, doc.originalname);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
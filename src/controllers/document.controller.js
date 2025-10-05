const documentService = require('../services/document.service.js');
const HttpError = require('../models/error.model');
const path = require('path');
const fs = require('fs');

async function share(req, res, next) {
  try {
    const doc = await documentService.shareDocument({ id: req.params.id, userId: req.user.id, userIds: req.body.userIds });
    res.json({ message: 'Document shared successfully', doc });
  } catch (err) {
    if (err.message === 'Document not found') return next(new HttpError(404, 'Document not found'));
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await documentService.deleteDocument({ id: req.params.id, userId: req.user.id });
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    if (err.message === 'Document not found') return next(new HttpError(404, 'Document not found'));
    next(err);
  }
}

async function upload(req, res, next) {
  try {
    const doc = await documentService.uploadDocument({
      file: req.file,
      userId: req.user.id,
      folderId: req.body.folderId
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const docs = await documentService.listDocuments(req.user.id);
    res.json(docs);
  } catch (err) {
    next(err);
  }
}

async function download(req, res, next) {
  try {
    const doc = await documentService.findDocumentById(req.params.id);
    if (!doc) return next(new HttpError(404, 'Document not found'));
    const uploadsPath = path.join(process.cwd(), 'uploads', doc.filename || '');
    const storagePath = path.join(process.cwd(), 'storage', doc.filename || '');
    const filePath = fs.existsSync(uploadsPath) ? uploadsPath : storagePath;
    res.download(filePath, doc.originalname);
  } catch (err) {
    next(err);
  }
}

module.exports = { share, remove, upload, list, download };

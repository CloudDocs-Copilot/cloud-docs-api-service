const Document = require('../models/document.model.js');
const Folder = require('../models/folder.model.js');
const fs = require('fs');

async function shareDocument(id, userIds) {
  const doc = await Document.findByIdAndUpdate(
    id,
    { $addToSet: { sharedWith: { $each: userIds } } },
    { new: true }
  );
  if (!doc) throw new Error('Document not found');
  return doc;
}

async function deleteDocument(id) {
  const doc = await Document.findByIdAndDelete(id);
  if (!doc) throw new Error('Document not found');
  const filePath = `storage/${doc.filename}`;
  fs.unlink(filePath, err => {
    if (err) console.error('Error al eliminar archivo:', err);
  });
  return doc;
}

async function uploadDocument({ file, userId, folderId }) {
  const doc = await Document.create({
    filename: file.filename,
    originalname: file.originalname,
    url: `/storage/${file.filename}`,
    uploadedBy: userId,
    folder: folderId
  });
  if (folderId) {
    await Folder.findByIdAndUpdate(folderId, { $push: { documents: doc._id } });
  }
  return doc;
}

function listDocuments(userId) {
  return Document.find({ uploadedBy: userId }).populate('folder');
}

async function findDocumentById(id) {
  return Document.findById(id);
}

module.exports = {
  shareDocument,
  deleteDocument,
  uploadDocument,
  listDocuments,
  findDocumentById
};

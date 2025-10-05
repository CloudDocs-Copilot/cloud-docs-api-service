const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const Document = require('../models/document.model.js');
const Folder = require('../models/folder.model.js');
const User = require('../models/user.model.js');
const HttpError = require('../models/error.model');

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Share a document with a list of users
 * @param {Object} params
 * @param {string} params.id - Document id
 * @param {string} params.userId - Current user performing the share (must be owner)
 * @param {string[]} params.userIds - Array of user ids to share with
 * @returns {Promise<Object>} Updated Document
 * @throws {Error|'Document not found'|HttpError}
 */
async function shareDocument({ id, userId, userIds }) {
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid document id');
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new HttpError(400, 'userIds must be a non-empty array');
  }
  const uniqueIds = [...new Set(userIds.filter(isValidObjectId))];
  if (uniqueIds.length === 0) throw new HttpError(400, 'At least one valid user id is required');

  const doc = await Document.findById(id);
  if (!doc) throw new Error('Document not found');
  if (String(doc.uploadedBy) !== String(userId)) throw new HttpError(403, 'Forbidden');

  // Opcionalmente, filtra solo usuarios existentes
  const existingUsers = await User.find({ _id: { $in: uniqueIds } }, { _id: 1 }).lean();
  const existingIds = existingUsers.map(u => String(u._id));
  if (existingIds.length === 0) throw new HttpError(400, 'No valid users found to share with');

  const updated = await Document.findByIdAndUpdate(
    id,
    { $addToSet: { sharedWith: { $each: existingIds } } },
    { new: true }
  );
  return updated;
}

/**
 * Delete a document if owned by the user; removes DB record, unlinks file, and pulls from folder.documents
 * @param {Object} params
 * @param {string} params.id - Document id
 * @param {string} params.userId - Owner user id
 * @returns {Promise<Object>} Deleted Document
 * @throws {Error|'Document not found'|HttpError}
 */
async function deleteDocument({ id, userId }) {
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid document id');
  const doc = await Document.findById(id);
  if (!doc) throw new Error('Document not found');
  if (String(doc.uploadedBy) !== String(userId)) throw new HttpError(403, 'Forbidden');

  // Elimina el archivo físico desde uploads/ o storage/
  try {
    if (doc.filename) {
      const uploadsPath = path.join(process.cwd(), 'uploads', doc.filename);
      const storagePath = path.join(process.cwd(), 'storage', doc.filename);
      if (fs.existsSync(uploadsPath)) fs.unlinkSync(uploadsPath);
      else if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
    }
  } catch (e) {
    console.error('File deletion error:', e.message);
  }

  // Elimina la referencia desde la carpeta si existe
  if (doc.folder && isValidObjectId(doc.folder)) {
    try {
      await Folder.findByIdAndUpdate(doc.folder, { $pull: { documents: doc._id } });
    } catch (e) {
      console.error('Folder reference cleanup error:', e.message);
    }
  }

  const deleted = await Document.findByIdAndDelete(id);
  return deleted;
}

/**
 * Create a Document for an uploaded file; validates folder ownership when provided
 * @param {Object} params
 * @param {Object} params.file - Multer file object
 * @param {string} params.userId - Uploader user id
 * @param {string} [params.folderId] - Optional folder id
 * @returns {Promise<Object>} Created Document
 * @throws {HttpError}
 */
async function uploadDocument({ file, userId, folderId }) {
  if (!file || !file.filename) throw new HttpError(400, 'File is required');

  const docData = {
    filename: file.filename,
    originalname: file.originalname,
    url: `/uploads/${file.filename}`,
    uploadedBy: userId
  };

  if (folderId) {
    if (!isValidObjectId(folderId)) throw new HttpError(400, 'Invalid folder id');
    const folder = await Folder.findById(folderId);
    if (!folder) throw new HttpError(404, 'Folder not found');
    if (String(folder.owner) !== String(userId)) throw new HttpError(403, 'Forbidden');
    docData.folder = folderId;
  }

  const doc = await Document.create(docData);
  if (doc.folder) {
    await Folder.findByIdAndUpdate(doc.folder, { $push: { documents: doc._id } });
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

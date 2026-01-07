import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import DocumentModel, { IDocument } from '../models/document.model';
import Folder from '../models/folder.model';
import User from '../models/user.model';
import HttpError from '../models/error.model';
import { sanitizePathOrThrow } from '../utils/path-sanitizer';

/**
 * Valida si un string es un ObjectId válido de MongoDB
 * 
 * @param id - String a validar
 * @returns true si es un ObjectId válido
 */
function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export interface ShareDocumentDto {
  id: string;
  userId: string;
  userIds: string[];
}

export interface DeleteDocumentDto {
  id: string;
  userId: string;
}

export interface UploadDocumentDto {
  file: Express.Multer.File;
  userId: string;
  folderId?: string;
}

/**
 * Compartir un documento con una lista de usuarios
 */
export async function shareDocument({ id, userId, userIds }: ShareDocumentDto): Promise<IDocument | null> {
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid document id');
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new HttpError(400, 'userIds must be a non-empty array');
  }
  const uniqueIds = [...new Set(userIds.filter(isValidObjectId))];
  if (uniqueIds.length === 0) throw new HttpError(400, 'At least one valid user id is required');

  const doc = await DocumentModel.findById(id);
  if (!doc) throw new Error('Document not found');
  if (String(doc.uploadedBy) !== String(userId)) throw new HttpError(403, 'Forbidden');

  // Filtra el owner de la lista de usuarios con los que compartir
  const filteredIds = uniqueIds.filter(id => String(id) !== String(userId));
  if (filteredIds.length === 0) throw new HttpError(400, 'Cannot share document with yourself as the owner');

  // Opcionalmente, filtra solo usuarios existentes
  const existingUsers = await User.find({ _id: { $in: filteredIds } }, { _id: 1 }).lean();
  const existingIds = existingUsers.map(u => String(u._id));
  if (existingIds.length === 0) throw new HttpError(400, 'No valid users found to share with');

  const updated = await DocumentModel.findByIdAndUpdate(
    id,
    { $addToSet: { sharedWith: { $each: existingIds } } },
    { new: true }
  );
  return updated;
}

/**
 * Eliminar un documento si el usuario es propietario
 */
export async function deleteDocument({ id, userId }: DeleteDocumentDto): Promise<IDocument | null> {
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid document id');
  const doc = await DocumentModel.findById(id);
  if (!doc) throw new Error('Document not found');
  if (String(doc.uploadedBy) !== String(userId)) throw new HttpError(403, 'Forbidden');

  // Elimina el archivo físico desde uploads/ o storage/
  try {
    if (doc.filename) {
      // Sanitizar el path para prevenir Path Traversal
      const uploadsBase = path.join(process.cwd(), 'uploads');
      const storageBase = path.join(process.cwd(), 'storage');
      
      const safeFilename = sanitizePathOrThrow(doc.filename, uploadsBase);
      const uploadsPath = path.join(uploadsBase, safeFilename);
      const storagePath = path.join(storageBase, safeFilename);
      
      if (fs.existsSync(uploadsPath)) fs.unlinkSync(uploadsPath);
      else if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
    }
  } catch (e: any) {
    console.error('File deletion error:', e.message);
  }

  // Elimina la referencia desde la carpeta si existe
  if (doc.folder && isValidObjectId(String(doc.folder))) {
    try {
      await Folder.findByIdAndUpdate(doc.folder, { $pull: { documents: doc._id } });
    } catch (e: any) {
      console.error('Folder reference cleanup error:', e.message);
    }
  }

  const deleted = await DocumentModel.findByIdAndDelete(id);
  return deleted;
}

/**
 * Crear un documento para un archivo subido
 */
export async function uploadDocument({ file, userId, folderId }: UploadDocumentDto): Promise<IDocument> {
  if (!file || !file.filename) throw new HttpError(400, 'File is required');

  // Sanitizar el filename para prevenir Path Traversal
  const uploadsBase = path.join(process.cwd(), 'uploads');
  const safeFilename = sanitizePathOrThrow(file.filename, uploadsBase);

  const docData: any = {
    filename: safeFilename,
    originalname: file.originalname,
    url: `/uploads/${safeFilename}`,
    uploadedBy: userId
  };

  if (folderId) {
    if (!isValidObjectId(folderId)) throw new HttpError(400, 'Invalid folder id');
    const folder = await Folder.findById(folderId);
    if (!folder) throw new HttpError(404, 'Folder not found');
    if (String(folder.owner) !== String(userId)) throw new HttpError(403, 'Forbidden');
    docData.folder = folderId;
  }

  const doc = await DocumentModel.create(docData);
  if (doc.folder) {
    await Folder.findByIdAndUpdate(doc.folder, { $push: { documents: doc._id } });
  }
  return doc;
}

export function listDocuments(userId: string): Promise<IDocument[]> {
  return DocumentModel.find({ uploadedBy: userId }).populate('folder');
}

export async function findDocumentById(id: string): Promise<IDocument | null> {
  return DocumentModel.findById(id);
}

export default {
  shareDocument,
  deleteDocument,
  uploadDocument,
  listDocuments,
  findDocumentById
};

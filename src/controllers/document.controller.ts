import { Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '../middlewares/auth.middleware';
import * as documentService from '../services/document.service';
import HttpError from '../models/error.model';

export async function share(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await documentService.shareDocument({
      id: req.params.id,
      userId: req.user!.id,
      userIds: req.body.userIds
    });
    res.json({ message: 'Document shared successfully', doc });
  } catch (err: any) {
    if (err.message === 'Document not found') {
      return next(new HttpError(404, 'Document not found'));
    }
    next(err);
  }
}

export async function remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await documentService.deleteDocument({
      id: req.params.id,
      userId: req.user!.id
    });
    res.json({ message: 'Document deleted successfully' });
  } catch (err: any) {
    if (err.message === 'Document not found') {
      return next(new HttpError(404, 'Document not found'));
    }
    next(err);
  }
}

export async function upload(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await documentService.uploadDocument({
      file: req.file!,
      userId: req.user!.id,
      folderId: req.body.folderId
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

export async function list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const docs = await documentService.listDocuments(req.user!.id);
    res.json(docs);
  } catch (err) {
    next(err);
  }
}

export async function download(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await documentService.findDocumentById(req.params.id);
    if (!doc) return next(new HttpError(404, 'Document not found'));
    
    const uploadsPath = path.join(process.cwd(), 'uploads', doc.filename || '');
    const storagePath = path.join(process.cwd(), 'storage', doc.filename || '');
    const filePath = fs.existsSync(uploadsPath) ? uploadsPath : storagePath;
    
    res.download(filePath, doc.originalname || 'download');
  } catch (err) {
    next(err);
  }
}

export default { share, remove, upload, list, download };

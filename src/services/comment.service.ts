import mongoose from 'mongoose';
import HttpError from '../models/error.model';
import CommentModel, { IComment } from '../models/comment.model';
import DocumentModel from '../models/document.model';
import { hasActiveMembership } from './membership.service';
import { notifyOrganizationMembers } from './notification.service';
import { emitToUser } from '../socket/socket';

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export interface CreateCommentDto {
  documentId: string;
  userId: string;
  content: string;
}

export interface ListCommentsDto {
  documentId: string;
  userId: string;
}

export interface UpdateCommentDto {
  commentId: string;
  userId: string;
  content: string;
}

/**
 * Verifica acceso de lectura al documento para comentarios.
 * - Org doc: membership ACTIVE en doc.organization
 * - Personal doc: uploadedBy o sharedWith
 */
async function ensureDocumentReadAccess(documentId: string, userId: string) {
  const doc = await DocumentModel.findById(documentId);
  if (!doc) throw new HttpError(404, 'Document not found');

  if (doc.organization) {
    const hasAccess = await hasActiveMembership(userId, doc.organization.toString());
    if (!hasAccess) throw new HttpError(403, 'Access denied to this document');
  } else {
    const hasAccess =
      doc.uploadedBy.toString() === userId.toString() ||
      doc.sharedWith?.some((id: any) => id.toString() === userId.toString());

    if (!hasAccess) throw new HttpError(403, 'Access denied to this document');
  }

  return doc;
}

export async function createComment({
  documentId,
  userId,
  content
}: CreateCommentDto): Promise<IComment> {
  if (!isValidObjectId(documentId)) throw new HttpError(400, 'Invalid document ID');
  if (!isValidObjectId(userId)) throw new HttpError(400, 'Invalid user ID');
  if (!content || !content.trim()) throw new HttpError(400, 'Content is required');

  const doc = await ensureDocumentReadAccess(documentId, userId);

  const comment = await CommentModel.create({
    document: documentId,
    organization: doc.organization ? doc.organization.toString() : null,
    createdBy: userId,
    content: content.trim()
  });

  // Notify all active members of the organization except the actor.
  // Only makes sense for org documents.
  if (doc.organization) {
    // Optional: get document name (best-effort)
    let docName = '';
    try {
      // doc.originalname might exist depending on your schema
      docName = (doc as any).originalname || (doc as any).filename || '';
    } catch {
      // ignore
    }

    await notifyOrganizationMembers({
      actorUserId: userId,
      type: 'DOC_COMMENTED',
      documentId,
      message: docName ? `New comment on: ${docName}` : 'New comment on a document',
      metadata: {
        documentId,
        commentId: comment._id?.toString(),
      },
      emitter: (recipientUserId, payload) => {
        emitToUser(recipientUserId, 'notification:new', payload);
      },
    });
  }

  return comment;
}

export async function listComments({ documentId, userId }: ListCommentsDto): Promise<IComment[]> {
  if (!isValidObjectId(documentId)) throw new HttpError(400, 'Invalid document ID');
  if (!isValidObjectId(userId)) throw new HttpError(400, 'Invalid user ID');

  await ensureDocumentReadAccess(documentId, userId);

  return CommentModel.find({ document: new mongoose.Types.ObjectId(documentId) })
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name email avatar')
    .select('-__v');
}

export async function updateComment({
  commentId,
  userId,
  content
}: UpdateCommentDto): Promise<IComment> {
  if (!isValidObjectId(commentId)) throw new HttpError(400, 'Invalid comment ID');
  if (!isValidObjectId(userId)) throw new HttpError(400, 'Invalid user ID');
  if (!content || !content.trim()) throw new HttpError(400, 'Content is required');

  const comment = await CommentModel.findById(commentId);
  if (!comment) throw new HttpError(404, 'Comment not found');

  if (comment.createdBy.toString() !== userId.toString()) {
    throw new HttpError(403, 'You can only edit your own comment');
  }

  // Ensure user still has access to the document (defense in depth)
  const doc = await ensureDocumentReadAccess(comment.document.toString(), userId);

  comment.content = content.trim();
  await comment.save();

  // Treat editing a comment as "DOC_COMMENTED" (simplest + matches your enum),
  // but we include metadata so UI can show "edited comment" if you want.
  if (doc.organization) {
    let docName = '';
    try {
      docName = (doc as any).originalname || (doc as any).filename || '';
    } catch {
      // ignore
    }

    await notifyOrganizationMembers({
      actorUserId: userId,
      type: 'DOC_COMMENTED',
      documentId: comment.document.toString(),
      message: docName ? `Comment edited on: ${docName}` : 'Comment edited on a document',
      metadata: {
        documentId: comment.document.toString(),
        commentId: comment._id?.toString(),
        edited: true,
      },
      emitter: (recipientUserId, payload) => {
        emitToUser(recipientUserId, 'notification:new', payload);
      },
    });
  }

  return comment;
}

export default {
  createComment,
  listComments,
  updateComment
};

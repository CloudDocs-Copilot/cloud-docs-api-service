jest.mock('../../../src/models/comment.model', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn()
  }
}));

jest.mock('../../../src/models/document.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn()
  }
}));

jest.mock('../../../src/services/membership.service', () => ({
  __esModule: true,
  hasActiveMembership: jest.fn()
}));

jest.mock('../../../src/services/notification.service', () => ({
  __esModule: true,
  notifyOrganizationMembers: jest.fn()
}));

jest.mock('../../../src/socket/socket', () => ({
  __esModule: true,
  emitToUser: jest.fn()
}));

import mongoose from 'mongoose';
import CommentModel from '../../../src/models/comment.model';
import DocumentModel from '../../../src/models/document.model';
import { hasActiveMembership } from '../../../src/services/membership.service';
import { notifyOrganizationMembers } from '../../../src/services/notification.service';
import { emitToUser } from '../../../src/socket/socket';
import * as commentService from '../../../src/services/comment.service';

interface MockDocument {
  _id: mongoose.Types.ObjectId;
  organization?: mongoose.Types.ObjectId | null;
  uploadedBy: mongoose.Types.ObjectId;
  sharedWith?: mongoose.Types.ObjectId[];
  originalname?: string;
  filename?: string;
}

interface MockComment {
  _id: mongoose.Types.ObjectId;
  document: mongoose.Types.ObjectId;
  organization?: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  content: string;
  save?: jest.Mock;
}

type NotifyArgs = { emitter: (id: string, payload: unknown) => void };
type NotificationPayload = {
  actorUserId?: string;
  type?: string;
  documentId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

describe('Comment Service', (): void => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const oid = (): string => new mongoose.Types.ObjectId().toString();

  const makeOrgDoc = (overrides: Partial<MockDocument> = {}): MockDocument => ({
    _id: new mongoose.Types.ObjectId(),
    organization: new mongoose.Types.ObjectId(),
    uploadedBy: new mongoose.Types.ObjectId(),
    sharedWith: [],
    originalname: 'My Doc.pdf',
    filename: 'my-doc.pdf',
    ...overrides
  });

  const makePersonalDoc = (overrides: Partial<MockDocument> = {}): MockDocument => ({
    _id: new mongoose.Types.ObjectId(),
    organization: null,
    uploadedBy: new mongoose.Types.ObjectId(),
    sharedWith: [],
    ...overrides
  });

  describe('createComment', (): void => {
    it('should throw 400 for invalid document ID', async (): Promise<void> => {
      // Arrange
      const invalidId = 'bad';
      const userId = oid();
      const content = 'Hello';

      // Act & Assert
      await expect(
        commentService.createComment({ documentId: invalidId, userId, content })
      ).rejects.toThrow('Invalid document ID');
    });

    it('should throw 400 for invalid user ID', async (): Promise<void> => {
      // Arrange
      const documentId = oid();
      const invalidUserId = 'bad';
      const content = 'Hello';

      // Act & Assert
      await expect(
        commentService.createComment({ documentId, userId: invalidUserId, content })
      ).rejects.toThrow('Invalid user ID');
    });

    it('should throw 400 when content is empty', async (): Promise<void> => {
      // Arrange
      const documentId = oid();
      const userId = oid();
      const emptyContent = '';

      // Act & Assert
      await expect(
        commentService.createComment({ documentId, userId, content: emptyContent })
      ).rejects.toThrow('Content is required');
    });

    it('should throw 400 when content is only whitespace', async (): Promise<void> => {
      // Arrange
      const documentId = oid();
      const userId = oid();
      const whitespaceContent = '   ';

      // Act & Assert
      await expect(
        commentService.createComment({ documentId, userId, content: whitespaceContent })
      ).rejects.toThrow('Content is required');
    });

    it('should throw 404 when document not found', async (): Promise<void> => {
      // Arrange
      const documentId = oid();
      const userId = oid();
      const content = 'Hello';
      (DocumentModel.findById as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        commentService.createComment({ documentId, userId, content })
      ).rejects.toThrow('Document not found');
    });

    it('should throw 403 when user has no active membership for org document', async (): Promise<void> => {
      // Arrange
      const doc = makeOrgDoc();
      const userId = oid();
      const content = 'Hello';
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);
      (hasActiveMembership as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(
        commentService.createComment({
          documentId: doc._id.toString(),
          userId,
          content
        })
      ).rejects.toThrow('Access denied to this document');
    });

    it('should throw 403 when user is not uploadedBy or sharedWith for personal document', async (): Promise<void> => {
      // Arrange
      const userId = oid();
      const doc = makePersonalDoc({
        uploadedBy: new mongoose.Types.ObjectId(),
        sharedWith: [new mongoose.Types.ObjectId()]
      });
      const content = 'Hello';
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);

      // Act & Assert
      await expect(
        commentService.createComment({ documentId: doc._id.toString(), userId, content })
      ).rejects.toThrow('Access denied to this document');
    });

    it('should create comment when user is uploadedBy for personal document', async (): Promise<void> => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const doc = makePersonalDoc({
        uploadedBy: userId,
        sharedWith: []
      });
      const created: MockComment = {
        _id: new mongoose.Types.ObjectId(),
        document: doc._id,
        organization: null,
        createdBy: userId,
        content: 'Hello'
      };
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);
      (CommentModel.create as jest.Mock).mockResolvedValue(created);

      // Act
      const result = await commentService.createComment({
        documentId: doc._id.toString(),
        userId: userId.toString(),
        content: '  Hello  '
      });

      // Assert
      expect(CommentModel.create).toHaveBeenCalledWith({
        document: doc._id.toString(),
        organization: null,
        createdBy: userId.toString(),
        content: 'Hello'
      });
      expect(result).toBe(created);
      expect(notifyOrganizationMembers).not.toHaveBeenCalled();
    });

    it('should create comment when user is in sharedWith for personal document', async (): Promise<void> => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const doc = makePersonalDoc({
        uploadedBy: new mongoose.Types.ObjectId(),
        sharedWith: [userId]
      });
      const created: MockComment = {
        _id: new mongoose.Types.ObjectId(),
        document: doc._id,
        organization: null,
        createdBy: userId,
        content: 'Hi'
      };
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);
      (CommentModel.create as jest.Mock).mockResolvedValue(created);

      // Act
      await commentService.createComment({
        documentId: doc._id.toString(),
        userId: userId.toString(),
        content: 'Hi'
      });

      // Assert
      expect(CommentModel.create).toHaveBeenCalled();
      expect(notifyOrganizationMembers).not.toHaveBeenCalled();
    });

    it('should create comment for org document and trigger notification with originalname', async (): Promise<void> => {
      // Arrange
      const userId = oid();
      const doc = makeOrgDoc({ originalname: 'Pretty Name.docx' });
      const created: MockComment = {
        _id: new mongoose.Types.ObjectId(),
        document: doc._id,
        organization: doc.organization,
        createdBy: new mongoose.Types.ObjectId(userId),
        content: 'hola'
      };
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (CommentModel.create as jest.Mock).mockResolvedValue(created);
      type NotifyArgs = { emitter: (id: string, payload: unknown) => void };
      type NotificationPayload = {
        actorUserId?: string;
        type?: string;
        documentId?: string;
        message?: string;
        metadata?: Record<string, unknown>;
      };
      (notifyOrganizationMembers as unknown as jest.MockedFunction<(args: NotifyArgs) => Promise<void>>).mockImplementation(
        async (args: NotifyArgs) => {
          args.emitter('recipient-user-id', { hello: 'world' });
        }
      );

      // Act
      const result = await commentService.createComment({
        documentId: doc._id.toString(),
        userId,
        content: '  hola  '
      });

      // Assert
      expect(CommentModel.create).toHaveBeenCalledWith({
        document: doc._id.toString(),
        organization: doc.organization?.toString(),
        createdBy: userId,
        content: 'hola'
      });
      expect(notifyOrganizationMembers).toHaveBeenCalledTimes(1);
      const payload = (notifyOrganizationMembers as unknown as jest.MockedFunction<(args: NotifyArgs) => Promise<void>>).mock.calls[0][0] as unknown as NotificationPayload;
      expect(payload.actorUserId).toBe(userId);
      expect(payload.type).toBe('DOC_COMMENTED');
      expect(payload.documentId).toBe(doc._id.toString());
      expect(payload.message).toBe('New comment on: Pretty Name.docx');
      expect(payload.metadata).toMatchObject({
        documentId: doc._id.toString(),
        commentId: created._id.toString()
      });
      expect(emitToUser).toHaveBeenCalledWith('recipient-user-id', 'notification:new', {
        hello: 'world'
      });
      expect(result).toBe(created);
    });

    it('should use filename fallback when originalname is missing in org document', async (): Promise<void> => {
      // Arrange
      const userId = oid();
      const doc = makeOrgDoc({ originalname: undefined, filename: 'fallback.pdf' });
      const created: MockComment = {
        _id: new mongoose.Types.ObjectId(),
        document: doc._id,
        organization: doc.organization,
        createdBy: new mongoose.Types.ObjectId(userId),
        content: 'Hi'
      };
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (CommentModel.create as jest.Mock).mockResolvedValue(created);

      // Act
      await commentService.createComment({
        documentId: doc._id.toString(),
        userId,
        content: 'Hi'
      });

      // Assert
      const payload = (notifyOrganizationMembers as unknown as jest.MockedFunction<(args: NotifyArgs) => Promise<void>>).mock.calls[0][0] as unknown as NotificationPayload;
      expect(payload.message).toBe('New comment on: fallback.pdf');
    });

    it('should use generic message when document name is not available', async (): Promise<void> => {
      // Arrange
      const userId = oid();
      const doc = makeOrgDoc({ originalname: undefined, filename: undefined });
      const created: MockComment = {
        _id: new mongoose.Types.ObjectId(),
        document: doc._id,
        organization: doc.organization,
        createdBy: new mongoose.Types.ObjectId(userId),
        content: 'Hi'
      };
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (CommentModel.create as jest.Mock).mockResolvedValue(created);

      // Act
      await commentService.createComment({
        documentId: doc._id.toString(),
        userId,
        content: 'Hi'
      });

      // Assert
      const payload = (notifyOrganizationMembers as unknown as jest.MockedFunction<(args: NotifyArgs) => Promise<void>>).mock.calls[0][0] as unknown as NotificationPayload;
      expect(payload.message).toBe('New comment on a document');
    });
  });

  describe('listComments', (): void => {
    it('should throw 400 for invalid document ID', async (): Promise<void> => {
      // Arrange
      const invalidId = 'bad';
      const userId = oid();

      // Act & Assert
      await expect(
        commentService.listComments({ documentId: invalidId, userId })
      ).rejects.toThrow('Invalid document ID');
    });

    it('should throw 400 for invalid user ID', async (): Promise<void> => {
      // Arrange
      const documentId = oid();
      const invalidUserId = 'bad';

      // Act & Assert
      await expect(
        commentService.listComments({ documentId, userId: invalidUserId })
      ).rejects.toThrow('Invalid user ID');
    });

    it('should return sorted and populated comments when user has access', async (): Promise<void> => {
      // Arrange
      const documentId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const doc = makePersonalDoc({ _id: documentId, uploadedBy: userId });
      const expectedComments = [{ content: 'Comment 1' }, { content: 'Comment 2' }];

      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);

      const select = jest.fn().mockResolvedValue(expectedComments);
      const populate = jest.fn().mockReturnValue({ select });
      const sort = jest.fn().mockReturnValue({ populate });
      (CommentModel.find as jest.Mock).mockReturnValue({ sort });

      // Act
      const result = await commentService.listComments({
        documentId: documentId.toString(),
        userId: userId.toString()
      });

      // Assert
      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(populate).toHaveBeenCalledWith('createdBy', 'name email avatar');
      expect(select).toHaveBeenCalledWith('-__v');
      expect(result).toBe(expectedComments);
    });
  });

  describe('updateComment', (): void => {
    it('should throw 400 for invalid comment ID', async (): Promise<void> => {
      // Arrange
      const invalidId = 'bad';
      const userId = oid();
      const content = 'Updated';

      // Act & Assert
      await expect(
        commentService.updateComment({ commentId: invalidId, userId, content })
      ).rejects.toThrow('Invalid comment ID');
    });

    it('should throw 400 for invalid user ID', async (): Promise<void> => {
      // Arrange
      const commentId = oid();
      const invalidUserId = 'bad';
      const content = 'Updated';

      // Act & Assert
      await expect(
        commentService.updateComment({ commentId, userId: invalidUserId, content })
      ).rejects.toThrow('Invalid user ID');
    });

    it('should throw 400 when content is only whitespace', async (): Promise<void> => {
      // Arrange
      const commentId = oid();
      const userId = oid();
      const whitespaceContent = '   ';

      // Act & Assert
      await expect(
        commentService.updateComment({ commentId, userId, content: whitespaceContent })
      ).rejects.toThrow('Content is required');
    });

    it('should throw 404 when comment not found', async (): Promise<void> => {
      // Arrange
      const commentId = oid();
      const userId = oid();
      const content = 'Updated';
      (CommentModel.findById as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(
        commentService.updateComment({ commentId, userId, content })
      ).rejects.toThrow('Comment not found');
    });

    it('should throw 403 when editing someone else comment', async (): Promise<void> => {
      // Arrange
      const comment: MockComment & { save: jest.Mock } = {
        _id: new mongoose.Types.ObjectId(),
        document: new mongoose.Types.ObjectId(),
        createdBy: new mongoose.Types.ObjectId(),
        content: 'Original',
        save: jest.fn()
      };
      const userId = oid();
      const content = 'Updated';
      (CommentModel.findById as jest.Mock).mockResolvedValue(comment);

      // Act & Assert
      await expect(
        commentService.updateComment({
          commentId: comment._id.toString(),
          userId,
          content
        })
      ).rejects.toThrow('You can only edit your own comment');
      expect(comment.save).not.toHaveBeenCalled();
    });

    it('should throw 403 if user lost access to document', async (): Promise<void> => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const comment: MockComment & { save: jest.Mock } = {
        _id: new mongoose.Types.ObjectId(),
        document: new mongoose.Types.ObjectId(),
        createdBy: userId,
        content: 'Original',
        save: jest.fn()
      };
      const doc = makeOrgDoc({ _id: comment.document });
      (CommentModel.findById as jest.Mock).mockResolvedValue(comment);
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);
      (hasActiveMembership as jest.Mock).mockResolvedValue(false);

      // Act & Assert
      await expect(
        commentService.updateComment({
          commentId: comment._id.toString(),
          userId: userId.toString(),
          content: 'Updated'
        })
      ).rejects.toThrow('Access denied to this document');
      expect(comment.save).not.toHaveBeenCalled();
    });

    it('should update comment for personal document without notification', async (): Promise<void> => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const comment: MockComment & { save: jest.Mock } = {
        _id: new mongoose.Types.ObjectId(),
        document: new mongoose.Types.ObjectId(),
        createdBy: userId,
        content: 'old',
        save: jest.fn().mockResolvedValue(undefined)
      };
      const doc = makePersonalDoc({ _id: comment.document, uploadedBy: userId });
      (CommentModel.findById as jest.Mock).mockResolvedValue(comment);
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);

      // Act
      const result = await commentService.updateComment({
        commentId: comment._id.toString(),
        userId: userId.toString(),
        content: '  new content  '
      });

      // Assert
      expect(comment.content).toBe('new content');
      expect(comment.save).toHaveBeenCalledTimes(1);
      expect(notifyOrganizationMembers).not.toHaveBeenCalled();
      expect(result).toBe(comment);
    });

    it('should update comment for org document and trigger notification with edited flag', async (): Promise<void> => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const comment: MockComment & { save: jest.Mock } = {
        _id: new mongoose.Types.ObjectId(),
        document: new mongoose.Types.ObjectId(),
        createdBy: userId,
        content: 'old',
        save: jest.fn().mockResolvedValue(undefined)
      };
      const doc = makeOrgDoc({
        _id: comment.document,
        organization: new mongoose.Types.ObjectId(),
        originalname: undefined,
        filename: 'doc-fallback.pdf'
      });
      (CommentModel.findById as jest.Mock).mockResolvedValue(comment);
      (DocumentModel.findById as jest.Mock).mockResolvedValue(doc);
      (hasActiveMembership as jest.Mock).mockResolvedValue(true);
      (notifyOrganizationMembers as unknown as jest.MockedFunction<(args: NotifyArgs) => Promise<void>>).mockImplementation(
        async (args: NotifyArgs) => {
          args.emitter('recipient', { ok: true });
        }
      );

      // Act
      const result = await commentService.updateComment({
        commentId: comment._id.toString(),
        userId: userId.toString(),
        content: '  edited  '
      });

      // Assert
      expect(comment.content).toBe('edited');
      expect(comment.save).toHaveBeenCalledTimes(1);
      expect(notifyOrganizationMembers).toHaveBeenCalledTimes(1);
      const payload = (notifyOrganizationMembers as unknown as jest.MockedFunction<(args: NotifyArgs) => Promise<void>>).mock.calls[0][0] as unknown as NotificationPayload;
      expect(payload.actorUserId).toBe(userId.toString());
      expect(payload.type).toBe('DOC_COMMENTED');
      expect(payload.documentId).toBe(comment.document.toString());
      expect(payload.message).toBe('Comment edited on: doc-fallback.pdf');
      expect(payload.metadata).toMatchObject({
        documentId: comment.document.toString(),
        commentId: comment._id.toString(),
        edited: true
      });
      expect(emitToUser).toHaveBeenCalledWith('recipient', 'notification:new', { ok: true });
      expect(result).toBe(comment);
    });
  });
});

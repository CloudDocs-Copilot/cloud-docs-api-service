import mongoose from 'mongoose';

jest.resetModules();

// ---- Mocks (must be defined before requiring the service) ----
jest.mock('../../../src/models/comment.model', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('../../../src/models/document.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock('../../../src/services/membership.service', () => ({
  __esModule: true,
  hasActiveMembership: jest.fn(),
}));

jest.mock('../../../src/services/notification.service', () => ({
  __esModule: true,
  notifyOrganizationMembers: jest.fn(),
}));

jest.mock('../../../src/socket/socket', () => ({
  __esModule: true,
  emitToUser: jest.fn(),
}));

// If your HttpError is a class, we don’t need to mock it.
// We'll assert on message strings via rejects.toThrow.
const CommentModel = require('../../../src/models/comment.model').default;
const DocumentModel = require('../../../src/models/document.model').default;
const { hasActiveMembership } = require('../../../src/services/membership.service');
const { notifyOrganizationMembers } = require('../../../src/services/notification.service');
const { emitToUser } = require('../../../src/socket/socket');

const commentService = require('../../../src/services/comment.service');

describe('comment.service (unit)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const oid = () => new mongoose.Types.ObjectId().toString();

  const makeOrgDoc = (overrides: any = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    organization: new mongoose.Types.ObjectId(),
    uploadedBy: new mongoose.Types.ObjectId(),
    sharedWith: [],
    originalname: 'My Doc.pdf',
    filename: 'my-doc.pdf',
    ...overrides,
  });

  const makePersonalDoc = (overrides: any = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    organization: null,
    uploadedBy: new mongoose.Types.ObjectId(),
    sharedWith: [],
    ...overrides,
  });

  describe('createComment', () => {
    it('throws 400 for invalid documentId', async () => {
      await expect(
        commentService.createComment({ documentId: 'bad', userId: oid(), content: 'hi' })
      ).rejects.toThrow('Invalid document ID');
    });

    it('throws 400 for invalid userId', async () => {
      await expect(
        commentService.createComment({ documentId: oid(), userId: 'bad', content: 'hi' })
      ).rejects.toThrow('Invalid user ID');
    });

    it('throws 400 when content is missing/blank', async () => {
      await expect(
        commentService.createComment({ documentId: oid(), userId: oid(), content: '' })
      ).rejects.toThrow('Content is required');

      await expect(
        commentService.createComment({ documentId: oid(), userId: oid(), content: '   ' })
      ).rejects.toThrow('Content is required');
    });

    it('throws 404 when document not found', async () => {
      DocumentModel.findById.mockResolvedValue(null);

      await expect(
        commentService.createComment({ documentId: oid(), userId: oid(), content: 'Hello' })
      ).rejects.toThrow('Document not found');
    });

    it('org doc: throws 403 when membership inactive', async () => {
      const doc = makeOrgDoc();
      DocumentModel.findById.mockResolvedValue(doc);
      hasActiveMembership.mockResolvedValue(false);

      await expect(
        commentService.createComment({ documentId: doc._id.toString(), userId: oid(), content: 'Hello' })
      ).rejects.toThrow('Access denied to this document');
    });

    it('personal doc: throws 403 when not uploadedBy and not sharedWith', async () => {
      const userId = oid();
      const doc = makePersonalDoc({
        uploadedBy: new mongoose.Types.ObjectId(), // different
        sharedWith: [new mongoose.Types.ObjectId()], // not user
      });
      DocumentModel.findById.mockResolvedValue(doc);

      await expect(
        commentService.createComment({ documentId: doc._id.toString(), userId, content: 'Hello' })
      ).rejects.toThrow('Access denied to this document');
    });

    it('personal doc: allows when user is uploadedBy', async () => {
      const userId = new mongoose.Types.ObjectId();
      const doc = makePersonalDoc({
        uploadedBy: userId,
        sharedWith: [],
      });

      DocumentModel.findById.mockResolvedValue(doc);

      const created = {
        _id: new mongoose.Types.ObjectId(),
        document: doc._id,
        organization: null,
        createdBy: userId,
        content: 'Hello',
      };
      CommentModel.create.mockResolvedValue(created);

      const res = await commentService.createComment({
        documentId: doc._id.toString(),
        userId: userId.toString(),
        content: '  Hello  ',
      });

      expect(CommentModel.create).toHaveBeenCalledWith({
        document: doc._id.toString(),
        organization: null,
        createdBy: userId.toString(),
        content: 'Hello',
      });
      expect(res).toBe(created);
      expect(notifyOrganizationMembers).not.toHaveBeenCalled();
    });

    it('personal doc: allows when user is in sharedWith', async () => {
      const userId = new mongoose.Types.ObjectId();
      const doc = makePersonalDoc({
        uploadedBy: new mongoose.Types.ObjectId(),
        sharedWith: [userId],
      });

      DocumentModel.findById.mockResolvedValue(doc);
      CommentModel.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      await commentService.createComment({
        documentId: doc._id.toString(),
        userId: userId.toString(),
        content: 'Hi',
      });

      expect(CommentModel.create).toHaveBeenCalled();
      expect(notifyOrganizationMembers).not.toHaveBeenCalled();
    });

    it('org doc: creates comment with organization string + triggers notify w/ docName from originalname', async () => {
      const userId = oid();
      const doc = makeOrgDoc({ originalname: 'Pretty Name.docx' });

      DocumentModel.findById.mockResolvedValue(doc);
      hasActiveMembership.mockResolvedValue(true);

      const createdComment = { _id: new mongoose.Types.ObjectId() };
      CommentModel.create.mockResolvedValue(createdComment);

      notifyOrganizationMembers.mockImplementation(async (args: any) => {
        // exercise emitter
        args.emitter('recipient-user-id', { hello: 'world' });
      });

      const res = await commentService.createComment({
        documentId: doc._id.toString(),
        userId,
        content: '  hola  ',
      });

      expect(CommentModel.create).toHaveBeenCalledWith({
        document: doc._id.toString(),
        organization: doc.organization.toString(),
        createdBy: userId,
        content: 'hola',
      });

      expect(notifyOrganizationMembers).toHaveBeenCalledTimes(1);
      const payload = notifyOrganizationMembers.mock.calls[0][0];

      expect(payload.actorUserId).toBe(userId);
      expect(payload.type).toBe('DOC_COMMENTED');
      expect(payload.documentId).toBe(doc._id.toString());
      expect(payload.message).toBe('New comment on: Pretty Name.docx');
      expect(payload.metadata).toMatchObject({
        documentId: doc._id.toString(),
        commentId: createdComment._id.toString(),
      });

      // emitter path should call emitToUser with expected event
      expect(emitToUser).toHaveBeenCalledWith('recipient-user-id', 'notification:new', { hello: 'world' });

      expect(res).toBe(createdComment);
    });

    it('org doc: notify uses filename fallback when originalname missing', async () => {
      const userId = oid();
      const doc = makeOrgDoc({ originalname: undefined, filename: 'fallback.pdf' });

      DocumentModel.findById.mockResolvedValue(doc);
      hasActiveMembership.mockResolvedValue(true);
      CommentModel.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      await commentService.createComment({
        documentId: doc._id.toString(),
        userId,
        content: 'Hi',
      });

      const payload = notifyOrganizationMembers.mock.calls[0][0];
      expect(payload.message).toBe('New comment on: fallback.pdf');
    });

    it('org doc: notify uses generic message when docName not available (also hits try/catch path)', async () => {
      const userId = oid();
      // Make doc throw on reading originalname/filename
      const doc = makeOrgDoc({ organization: new mongoose.Types.ObjectId() });
      Object.defineProperty(doc, 'originalname', {
        get() {
          throw new Error('boom');
        },
      });
      Object.defineProperty(doc, 'filename', {
        get() {
          throw new Error('boom2');
        },
      });

      DocumentModel.findById.mockResolvedValue(doc);
      hasActiveMembership.mockResolvedValue(true);
      CommentModel.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      await commentService.createComment({
        documentId: doc._id.toString(),
        userId,
        content: 'Hi',
      });

      const payload = notifyOrganizationMembers.mock.calls[0][0];
      expect(payload.message).toBe('New comment on a document');
    });
  });

  describe('listComments', () => {
    it('throws 400 for invalid ids', async () => {
      await expect(commentService.listComments({ documentId: 'bad', userId: oid() }))
        .rejects.toThrow('Invalid document ID');

      await expect(commentService.listComments({ documentId: oid(), userId: 'bad' }))
        .rejects.toThrow('Invalid user ID');
    });

    it('enforces access then returns chained query (sort/populate/select)', async () => {
      const documentId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      // personal doc: uploadedBy is user => allowed
      const doc = makePersonalDoc({ _id: documentId, uploadedBy: userId });
      DocumentModel.findById.mockResolvedValue(doc);

      const final = [{ content: 'c1' }, { content: 'c2' }];

      const select = jest.fn().mockResolvedValue(final);
      const populate = jest.fn().mockReturnValue({ select });
      const sort = jest.fn().mockReturnValue({ populate });
      CommentModel.find.mockReturnValue({ sort });

      const res = await commentService.listComments({
        documentId: documentId.toString(),
        userId: userId.toString(),
      });

      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(populate).toHaveBeenCalledWith('createdBy', 'name email avatar');
      expect(select).toHaveBeenCalledWith('-__v');
      expect(res).toBe(final);
    });
  });

  describe('updateComment', () => {
    it('throws 400 for invalid ids / blank content', async () => {
      await expect(
        commentService.updateComment({ commentId: 'bad', userId: oid(), content: 'x' })
      ).rejects.toThrow('Invalid comment ID');

      await expect(
        commentService.updateComment({ commentId: oid(), userId: 'bad', content: 'x' })
      ).rejects.toThrow('Invalid user ID');

      await expect(
        commentService.updateComment({ commentId: oid(), userId: oid(), content: '   ' })
      ).rejects.toThrow('Content is required');
    });

    it('throws 404 when comment not found', async () => {
      CommentModel.findById.mockResolvedValue(null);

      await expect(
        commentService.updateComment({ commentId: oid(), userId: oid(), content: 'hello' })
      ).rejects.toThrow('Comment not found');
    });

    it('throws 403 when editing someone else comment', async () => {
      const comment = {
        _id: new mongoose.Types.ObjectId(),
        document: new mongoose.Types.ObjectId(),
        createdBy: new mongoose.Types.ObjectId(), // not user
        content: 'x',
        save: jest.fn(),
      };

      CommentModel.findById.mockResolvedValue(comment);

      await expect(
        commentService.updateComment({ commentId: comment._id.toString(), userId: oid(), content: 'hello' })
      ).rejects.toThrow('You can only edit your own comment');

      expect(comment.save).not.toHaveBeenCalled();
    });

    it('defense in depth: rechecks doc access and can throw 403 if lost access', async () => {
      const userId = new mongoose.Types.ObjectId();
      const comment = {
        _id: new mongoose.Types.ObjectId(),
        document: new mongoose.Types.ObjectId(),
        createdBy: userId,
        content: 'x',
        save: jest.fn(),
      };

      CommentModel.findById.mockResolvedValue(comment);

      // Org doc, but membership denied
      const doc = makeOrgDoc({ _id: comment.document });
      DocumentModel.findById.mockResolvedValue(doc);
      hasActiveMembership.mockResolvedValue(false);

      await expect(
        commentService.updateComment({
          commentId: comment._id.toString(),
          userId: userId.toString(),
          content: ' updated ',
        })
      ).rejects.toThrow('Access denied to this document');

      expect(comment.save).not.toHaveBeenCalled();
    });

    it('updates comment content (trim) and does NOT notify for personal doc', async () => {
      const userId = new mongoose.Types.ObjectId();
      const comment = {
        _id: new mongoose.Types.ObjectId(),
        document: new mongoose.Types.ObjectId(),
        createdBy: userId,
        content: 'old',
        save: jest.fn().mockResolvedValue(undefined),
      };

      CommentModel.findById.mockResolvedValue(comment);

      // Personal doc: user is uploadedBy
      const doc = makePersonalDoc({ _id: comment.document, uploadedBy: userId });
      DocumentModel.findById.mockResolvedValue(doc);

      const res = await commentService.updateComment({
        commentId: comment._id.toString(),
        userId: userId.toString(),
        content: '  new content  ',
      });

      expect(comment.content).toBe('new content');
      expect(comment.save).toHaveBeenCalledTimes(1);
      expect(notifyOrganizationMembers).not.toHaveBeenCalled();
      expect(res).toBe(comment);
    });

    it('org doc: updates comment and notifies with edited=true and docName fallback', async () => {
      const userId = new mongoose.Types.ObjectId();
      const comment = {
        _id: new mongoose.Types.ObjectId(),
        document: new mongoose.Types.ObjectId(),
        createdBy: userId,
        content: 'old',
        save: jest.fn().mockResolvedValue(undefined),
      };

      CommentModel.findById.mockResolvedValue(comment);

      const doc = makeOrgDoc({
        _id: comment.document,
        organization: new mongoose.Types.ObjectId(),
        originalname: undefined,
        filename: 'doc-fallback.pdf',
      });
      DocumentModel.findById.mockResolvedValue(doc);
      hasActiveMembership.mockResolvedValue(true);

      notifyOrganizationMembers.mockImplementation(async (args: any) => {
        args.emitter('recipient', { ok: true });
      });

      const res = await commentService.updateComment({
        commentId: comment._id.toString(),
        userId: userId.toString(),
        content: '  edited  ',
      });

      expect(comment.content).toBe('edited');
      expect(comment.save).toHaveBeenCalledTimes(1);

      expect(notifyOrganizationMembers).toHaveBeenCalledTimes(1);
      const payload = notifyOrganizationMembers.mock.calls[0][0];

      expect(payload.actorUserId).toBe(userId.toString()); // service passes string from dto
      expect(payload.type).toBe('DOC_COMMENTED');
      expect(payload.documentId).toBe(comment.document.toString());
      expect(payload.message).toBe('Comment edited on: doc-fallback.pdf');
      expect(payload.metadata).toMatchObject({
        documentId: comment.document.toString(),
        commentId: comment._id.toString(),
        edited: true,
      });

      expect(emitToUser).toHaveBeenCalledWith('recipient', 'notification:new', { ok: true });
      expect(res).toBe(comment);
    });

    it('org doc: notify uses generic message when docName throws (hits try/catch)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const comment = {
        _id: new mongoose.Types.ObjectId(),
        document: new mongoose.Types.ObjectId(),
        createdBy: userId,
        content: 'old',
        save: jest.fn().mockResolvedValue(undefined),
      };

      CommentModel.findById.mockResolvedValue(comment);

      const doc = makeOrgDoc({ _id: comment.document, organization: new mongoose.Types.ObjectId() });
      Object.defineProperty(doc, 'originalname', {
        get() {
          throw new Error('boom');
        },
      });
      Object.defineProperty(doc, 'filename', {
        get() {
          throw new Error('boom2');
        },
      });

      DocumentModel.findById.mockResolvedValue(doc);
      hasActiveMembership.mockResolvedValue(true);

      await commentService.updateComment({
        commentId: comment._id.toString(),
        userId: userId.toString(),
        content: '  edited  ',
      });

      const payload = notifyOrganizationMembers.mock.calls[0][0];
      expect(payload.message).toBe('Comment edited on a document');
    });
  });
});

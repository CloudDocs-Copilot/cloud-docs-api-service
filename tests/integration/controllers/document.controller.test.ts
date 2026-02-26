// document.controller.spec.ts
export {};

import mongoose from 'mongoose';

const mockUploadDocument = jest.fn();
const mockReplaceDocumentFile = jest.fn();
const mockListDocuments = jest.fn();
const mockListSharedDocumentsToUser = jest.fn();
const mockGetUserRecentDocuments = jest.fn();
const mockFindDocumentById = jest.fn();
const mockShareDocument = jest.fn();
const mockMoveDocument = jest.fn();
const mockCopyDocument = jest.fn();
const mockDeleteDocument = jest.fn();

const mockValidateDownloadPath = jest.fn();

const mockHasAnyRole = jest.fn();

const mockMammothConvertToHtml = jest.fn();

jest.mock('../../../src/services/document.service', () => ({
  __esModule: true,
  uploadDocument: (...args: unknown[]) => mockUploadDocument(...args),
  replaceDocumentFile: (...args: unknown[]) => mockReplaceDocumentFile(...args),
  listDocuments: (...args: unknown[]) => mockListDocuments(...args),
  listSharedDocumentsToUser: (...args: unknown[]) => mockListSharedDocumentsToUser(...args),
  getUserRecentDocuments: (...args: unknown[]) => mockGetUserRecentDocuments(...args),
  findDocumentById: (...args: unknown[]) => mockFindDocumentById(...args),
  shareDocument: (...args: unknown[]) => mockShareDocument(...args),
  moveDocument: (...args: unknown[]) => mockMoveDocument(...args),
  copyDocument: (...args: unknown[]) => mockCopyDocument(...args),
  deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
}));

jest.mock('../../../src/utils/path-sanitizer', () => ({
  __esModule: true,
  validateDownloadPath: (...args: unknown[]) => mockValidateDownloadPath(...args),
}));

/**
 * IMPORTANT:
 * document.controller does a runtime require('../services/membership.service')
 * and require('../models/membership.model') inside hasOrgAdminAccess.
 */
jest.mock('../../../src/services/membership.service', () => ({
  __esModule: true,
  hasAnyRole: (...args: unknown[]) => mockHasAnyRole(...args),
}));

jest.mock('../../../src/models/membership.model', () => ({
  __esModule: true,
  MembershipRole: {
    OWNER: 'OWNER',
    ADMIN: 'ADMIN',
  },
}));

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    convertToHtml: (...args: unknown[]) => mockMammothConvertToHtml(...args),
  },
  convertToHtml: (...args: unknown[]) => mockMammothConvertToHtml(...args),
}));

type MockRes = {
  status: jest.Mock;
  json: jest.Mock;
  download: jest.Mock;
  send: jest.Mock;
  sendFile: jest.Mock;
  setHeader: jest.Mock;
};

function makeRes(): MockRes {
  const res: Partial<MockRes> = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.download = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.sendFile = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  return res as MockRes;
}

function makeNext() {
  return jest.fn();
}

afterEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe('document.controller (unit)', () => {
  const USER_ID = '507f1f77bcf86cd799439011';
  const OTHER_USER_ID = '507f1f77bcf86cd799439099';
  const ORG_ID = '507f1f77bcf86cd799439012';
  const DOC_ID = '507f1f77bcf86cd799439013';

  describe('upload', () => {
    it('should next 400 when file missing', async () => {
      const { upload } = require('../../../src/controllers/document.controller');
      const req: { file?: unknown; body: Record<string, unknown>; user: { id: string } } = {
        file: undefined,
        body: {},
        user: { id: USER_ID },
      };
      const res = makeRes();
      const next = makeNext();

      await upload(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockUploadDocument).not.toHaveBeenCalled();
    });

    it('should call service with folderId undefined when not provided', async () => {
      const { upload } = require('../../../src/controllers/document.controller');
      mockUploadDocument.mockResolvedValue({ _id: 'doc1' });

      const req: { file: unknown; body: Record<string, unknown>; user: { id: string } } = {
        file: { filename: 'a.txt' },
        body: {},
        user: { id: USER_ID },
      };
      const res = makeRes();
      const next = makeNext();

      await upload(req, res, next);

      expect(mockUploadDocument).toHaveBeenCalledWith({
        file: req.file,
        userId: USER_ID,
        folderId: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document uploaded successfully' })
      );
    });

    it('should call service and return 201 on success', async () => {
      const { upload } = require('../../../src/controllers/document.controller');
      mockUploadDocument.mockResolvedValue({ _id: 'doc1' });

      const req: { file: unknown; body: { folderId?: string }; user: { id: string } } = {
        file: { filename: 'a.txt' },
        body: { folderId: '507f1f77bcf86cd799439088' },
        user: { id: USER_ID },
      };
      const res = makeRes();
      const next = makeNext();

      await upload(req, res, next);

      expect(mockUploadDocument).toHaveBeenCalledWith({
        file: req.file,
        userId: USER_ID,
        folderId: '507f1f77bcf86cd799439088',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document uploaded successfully' })
      );
    });
  });

  describe('replaceFile', () => {
    it('should next 400 when file missing', async () => {
      const { replaceFile } = require('../../../src/controllers/document.controller');
      const req: { file?: unknown; params: { id: string }; user: { id: string } } = {
        file: undefined,
        params: { id: DOC_ID },
        user: { id: USER_ID },
      };
      const res = makeRes();
      const next = makeNext();

      await replaceFile(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockReplaceDocumentFile).not.toHaveBeenCalled();
    });

    it('should map "Document not found" to 404', async () => {
      const { replaceFile } = require('../../../src/controllers/document.controller');
      mockReplaceDocumentFile.mockRejectedValue(new Error('Document not found'));

      const req: { file: unknown; params: { id: string }; user: { id: string } } = {
        file: { filename: 'a.txt' },
        params: { id: DOC_ID },
        user: { id: USER_ID },
      };
      const res = makeRes();
      const next = makeNext();

      await replaceFile(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return success json on success', async () => {
      const { replaceFile } = require('../../../src/controllers/document.controller');
      mockReplaceDocumentFile.mockResolvedValue({ _id: DOC_ID });

      const req: { file: unknown; params: { id: string }; user: { id: string } } = {
        file: { filename: 'a.txt' },
        params: { id: DOC_ID },
        user: { id: USER_ID },
      };
      const res = makeRes();
      const next = makeNext();

      await replaceFile(req, res, next);

      expect(mockReplaceDocumentFile).toHaveBeenCalledWith({
        documentId: DOC_ID,
        userId: USER_ID,
        file: req.file,
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document file replaced successfully' })
      );
    });
  });

  describe('list', () => {
    it('should return docs and count', async () => {
      const { list } = require('../../../src/controllers/document.controller');
      mockListDocuments.mockResolvedValue([{ _id: 1 }, { _id: 2 }]);

      const req: { user: { id: string } } = { user: { id: USER_ID } };
      const res = makeRes();
      const next = makeNext();

      await list(req, res, next);

      expect(mockListDocuments).toHaveBeenCalledWith(USER_ID);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 2, documents: expect.any(Array) })
      );
    });
  });

  describe('listSharedToMe', () => {
    it('should return docs and count', async () => {
      const { listSharedToMe } = require('../../../src/controllers/document.controller');
      mockListSharedDocumentsToUser.mockResolvedValue([{ _id: 1 }]);

      const req: { user: { id: string } } = { user: { id: USER_ID } };
      const res = makeRes();
      const next = makeNext();

      await listSharedToMe(req, res, next);

      expect(mockListSharedDocumentsToUser).toHaveBeenCalledWith(USER_ID);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 1, documents: expect.any(Array) })
      );
    });
  });

  describe('getRecent', () => {
    it('should next 400 when organizationId missing', async () => {
      const { getRecent } = require('../../../src/controllers/document.controller');
      const req: { user: { id: string }; params: Record<string, unknown>; query: Record<string, unknown> } = {
        user: { id: USER_ID },
        params: {},
        query: {},
      };
      const res = makeRes();
      const next = makeNext();

      await getRecent(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockGetUserRecentDocuments).not.toHaveBeenCalled();
    });

    it('should next 400 when organizationId invalid', async () => {
      const { getRecent } = require('../../../src/controllers/document.controller');
      const req: { user: { id: string }; params: { organizationId: string }; query: Record<string, unknown> } = {
        user: { id: USER_ID },
        params: { organizationId: 'invalid' },
        query: {},
      };
      const res = makeRes();
      const next = makeNext();

      await getRecent(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockGetUserRecentDocuments).not.toHaveBeenCalled();
    });

    it('should default limit=10 and return docs', async () => {
      const { getRecent } = require('../../../src/controllers/document.controller');
      mockGetUserRecentDocuments.mockResolvedValue([{ _id: 1 }, { _id: 2 }]);

      const req: { user: { id: string }; params: { organizationId: string }; query: Record<string, unknown> } = {
        user: { id: USER_ID },
        params: { organizationId: ORG_ID },
        query: {},
      };
      const res = makeRes();
      const next = makeNext();

      await getRecent(req, res, next);

      expect(mockGetUserRecentDocuments).toHaveBeenCalledWith({ userId: USER_ID, limit: 10 });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 2, documents: expect.any(Array) })
      );
    });

    it('should parse limit from query', async () => {
      const { getRecent } = require('../../../src/controllers/document.controller');
      mockGetUserRecentDocuments.mockResolvedValue([]);

      const req: { user: { id: string }; params: { organizationId: string }; query: { limit: string } } = {
        user: { id: USER_ID },
        params: { organizationId: ORG_ID },
        query: { limit: '2' },
      };
      const res = makeRes();
      const next = makeNext();

      await getRecent(req, res, next);

      expect(mockGetUserRecentDocuments).toHaveBeenCalledWith({ userId: USER_ID, limit: 2 });
    });
  });

  describe('getById', () => {
    it('should next 404 when doc not found', async () => {
      const { getById } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue(null);

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow access for org doc when user is owner (no membership check needed)', async () => {
      const { getById } = require('../../../src/controllers/document.controller');

      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: new mongoose.Types.ObjectId(ORG_ID),
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
      });

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(mockHasAnyRole).not.toHaveBeenCalled();
    });

    it('should allow access for org doc when user is in sharedWith', async () => {
      const { getById } = require('../../../src/controllers/document.controller');

      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: new mongoose.Types.ObjectId(ORG_ID),
        uploadedBy: new mongoose.Types.ObjectId(OTHER_USER_ID),
        sharedWith: [new mongoose.Types.ObjectId(USER_ID)],
      });

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should allow access for org doc when user is org admin (hasAnyRole true)', async () => {
      const { getById } = require('../../../src/controllers/document.controller');

      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: new mongoose.Types.ObjectId(ORG_ID),
        uploadedBy: new mongoose.Types.ObjectId(OTHER_USER_ID),
        sharedWith: [],
      });
      mockHasAnyRole.mockResolvedValue(true);

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(mockHasAnyRole).toHaveBeenCalledWith(USER_ID, ORG_ID, ['OWNER', 'ADMIN']);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should deny access for org doc when not owner/shared and hasAnyRole false', async () => {
      const { getById } = require('../../../src/controllers/document.controller');

      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: new mongoose.Types.ObjectId(ORG_ID),
        uploadedBy: new mongoose.Types.ObjectId(OTHER_USER_ID),
        sharedWith: [],
      });
      mockHasAnyRole.mockResolvedValue(false);

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow access for personal doc when user is owner', async () => {
      const { getById } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
      });

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should allow access for personal doc when user is in sharedWith', async () => {
      const { getById } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(OTHER_USER_ID),
        sharedWith: [new mongoose.Types.ObjectId(USER_ID)],
      });

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('share', () => {
    it('should next 400 when userIds missing/invalid', async () => {
      const { share } = require('../../../src/controllers/document.controller');

      const req: { user: { id: string }; params: { id: string }; body: Record<string, unknown> } = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: {},
      };
      const res = makeRes();
      const next = makeNext();

      await share(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockShareDocument).not.toHaveBeenCalled();
    });

    it('should map "Document not found" to 404', async () => {
      const { share } = require('../../../src/controllers/document.controller');
      mockShareDocument.mockRejectedValue(new Error('Document not found'));

      const req: { user: { id: string }; params: { id: string }; body: { userIds: string[] } } = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: { userIds: [USER_ID] },
      };
      const res = makeRes();
      const next = makeNext();

      await share(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return success on valid request', async () => {
      const { share } = require('../../../src/controllers/document.controller');
      mockShareDocument.mockResolvedValue({ _id: DOC_ID });

      const req: { user: { id: string }; params: { id: string }; body: { userIds: string[] } } = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: { userIds: [USER_ID] },
      };
      const res = makeRes();
      const next = makeNext();

      await share(req, res, next);

      expect(mockShareDocument).toHaveBeenCalledWith({
        id: DOC_ID,
        userId: USER_ID,
        userIds: [USER_ID],
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document shared successfully' })
      );
    });
  });

  describe('move', () => {
    it('should next 400 when targetFolderId missing', async () => {
      const { move } = require('../../../src/controllers/document.controller');
      const req: { user: { id: string }; params: { id: string }; body: Record<string, unknown> } = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: {},
      };
      const res = makeRes();
      const next = makeNext();

      await move(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockMoveDocument).not.toHaveBeenCalled();
    });

    it('should return success when service resolves', async () => {
      const { move } = require('../../../src/controllers/document.controller');
      mockMoveDocument.mockResolvedValue({ _id: DOC_ID });

      const req: { user: { id: string }; params: { id: string }; body: { targetFolderId: string } } = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: { targetFolderId: '507f1f77bcf86cd799439099' },
      };
      const res = makeRes();
      const next = makeNext();

      await move(req, res, next);

      expect(mockMoveDocument).toHaveBeenCalledWith({
        documentId: DOC_ID,
        userId: USER_ID,
        targetFolderId: '507f1f77bcf86cd799439099',
      });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document moved successfully' })
      );
    });
  });

  describe('copy', () => {
    it('should next 400 when targetFolderId missing', async () => {
      const { copy } = require('../../../src/controllers/document.controller');
      const req: { user: { id: string }; params: { id: string }; body: Record<string, unknown> } = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: {},
      };
      const res = makeRes();
      const next = makeNext();

      await copy(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockCopyDocument).not.toHaveBeenCalled();
    });

    it('should return 201 when service resolves', async () => {
      const { copy } = require('../../../src/controllers/document.controller');
      mockCopyDocument.mockResolvedValue({ _id: 'newDoc' });

      const req: { user: { id: string }; params: { id: string }; body: { targetFolderId: string } } = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: { targetFolderId: '507f1f77bcf86cd799439099' },
      };
      const res = makeRes();
      const next = makeNext();

      await copy(req, res, next);

      expect(mockCopyDocument).toHaveBeenCalledWith({
        documentId: DOC_ID,
        userId: USER_ID,
        targetFolderId: '507f1f77bcf86cd799439099',
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document copied successfully' })
      );
    });
  });

  describe('download', () => {
    it('should next 404 when doc not found', async () => {
      const { download } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue(null);

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await download(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should next 403 when access denied (org doc)', async () => {
      const { download } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: new mongoose.Types.ObjectId(ORG_ID),
        uploadedBy: new mongoose.Types.ObjectId(OTHER_USER_ID),
        sharedWith: [],
        filename: 'a.pdf',
        originalname: 'a.pdf',
        path: '/obs/a.pdf',
      });
      mockHasAnyRole.mockResolvedValue(false);

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await download(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockValidateDownloadPath).not.toHaveBeenCalled();
    });

    it('should download using uploads path if validateDownloadPath succeeds (uses doc.filename)', async () => {
      const { download } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        filename: 'a.pdf',
        originalname: 'nice.pdf',
        path: '/org/a.pdf',
      });

      mockValidateDownloadPath.mockResolvedValue('/abs/uploads/a.pdf');

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await download(req, res, next);

      expect(mockValidateDownloadPath).toHaveBeenCalledTimes(1);
      expect(mockValidateDownloadPath).toHaveBeenCalledWith('a.pdf', expect.any(String));
      expect(res.download).toHaveBeenCalledWith('/abs/uploads/a.pdf', 'nice.pdf');
    });

    it('should fallback to storage using doc.path when uploads fails', async () => {
      const { download } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        filename: 'a.pdf',
        originalname: 'nice.pdf',
        path: '/org/a.pdf',
      });

      mockValidateDownloadPath
        .mockRejectedValueOnce(new Error('nope')) // uploads attempt with filename
        .mockResolvedValueOnce('/abs/storage/org/a.pdf'); // storage attempt with relative path from doc.path

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await download(req, res, next);

      expect(mockValidateDownloadPath).toHaveBeenCalledTimes(2);
      expect(mockValidateDownloadPath).toHaveBeenNthCalledWith(1, 'a.pdf', expect.any(String));
      expect(mockValidateDownloadPath).toHaveBeenNthCalledWith(2, 'org/a.pdf', expect.any(String));
      expect(res.download).toHaveBeenCalledWith('/abs/storage/org/a.pdf', 'nice.pdf');
    });

    it('should next 404 File not found when both validations fail', async () => {
      const { download } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        filename: 'a.pdf',
        originalname: 'nice.pdf',
        path: '/org/a.pdf',
      });

      mockValidateDownloadPath
        .mockRejectedValueOnce(new Error('no uploads'))
        .mockRejectedValueOnce(new Error('no storage'));

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await download(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.download).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('should next 404 when doc not found', async () => {
      const { preview } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue(null);

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should try uploads -> storage -> alternative (obs) in uploads, then serve file inline', async () => {
      const { preview } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        path: 'org/file.pdf',
        originalname: 'file.pdf',
        mimeType: 'application/pdf',
      });

      mockValidateDownloadPath
        .mockRejectedValueOnce(new Error('uploads fail')) // uploads attempt (relativePath, uploadsBase)
        .mockRejectedValueOnce(new Error('storage fail')) // storage attempt (relativePath, storageBase)
        .mockResolvedValueOnce('/abs/uploads/obs/org/file.pdf'); // alternativePath in uploads

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(mockValidateDownloadPath).toHaveBeenCalledTimes(3);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('inline;'));
      expect(res.sendFile).toHaveBeenCalledWith('/abs/uploads/obs/org/file.pdf');
    });

    it('should convert Word to HTML when mammoth succeeds', async () => {
      const { preview } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        path: 'org/file.docx',
        originalname: 'file.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      mockValidateDownloadPath.mockResolvedValue('/abs/storage/org/file.docx');
      mockMammothConvertToHtml.mockResolvedValue({ value: '<p>Hello</p>' });

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<!DOCTYPE html>'));
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<p>Hello</p>'));
      expect(res.sendFile).not.toHaveBeenCalled();
    });

    it('should fallback to serving original file when mammoth fails', async () => {
      const { preview } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        path: 'org/file.docx',
        originalname: 'file.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      mockValidateDownloadPath.mockResolvedValue('/abs/storage/org/file.docx');
      mockMammothConvertToHtml.mockRejectedValue(new Error('bad docx'));

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(res.sendFile).toHaveBeenCalledWith('/abs/storage/org/file.docx');
    });

    it('should next 403 when access denied (org doc)', async () => {
      const { preview } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: new mongoose.Types.ObjectId(ORG_ID),
        uploadedBy: new mongoose.Types.ObjectId(OTHER_USER_ID),
        sharedWith: [],
        path: 'org/file.pdf',
        originalname: 'file.pdf',
        mimeType: 'application/pdf',
      });
      mockHasAnyRole.mockResolvedValue(false);

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockValidateDownloadPath).not.toHaveBeenCalled();
    });

    it('should next 404 when file not found after all path attempts', async () => {
      const { preview } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        path: 'org/file.pdf',
        originalname: 'file.pdf',
        mimeType: 'application/pdf',
      });

      mockValidateDownloadPath
        .mockRejectedValueOnce(new Error('no uploads'))
        .mockRejectedValueOnce(new Error('no storage'))
        .mockRejectedValueOnce(new Error('no alternative'));

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.sendFile).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should map "Document not found" to 404', async () => {
      const { remove } = require('../../../src/controllers/document.controller');
      mockDeleteDocument.mockRejectedValue(new Error('Document not found'));

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await remove(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return success json when deleted', async () => {
      const { remove } = require('../../../src/controllers/document.controller');
      mockDeleteDocument.mockResolvedValue({ _id: DOC_ID });

      const req: { user: { id: string }; params: { id: string } } = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await remove(req, res, next);

      expect(mockDeleteDocument).toHaveBeenCalledWith({ id: DOC_ID, userId: USER_ID });
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document deleted successfully' })
      );
    });
  });
});

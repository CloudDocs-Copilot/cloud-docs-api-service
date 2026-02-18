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
const mockHasActiveMembership = jest.fn();

const mockMammothConvertToHtml = jest.fn();

jest.mock('../../../src/services/document.service', () => ({
  __esModule: true,
  uploadDocument: (...args: any[]) => mockUploadDocument(...args),
  replaceDocumentFile: (...args: any[]) => mockReplaceDocumentFile(...args),
  listDocuments: (...args: any[]) => mockListDocuments(...args),
  listSharedDocumentsToUser: (...args: any[]) => mockListSharedDocumentsToUser(...args),
  getUserRecentDocuments: (...args: any[]) => mockGetUserRecentDocuments(...args),
  findDocumentById: (...args: any[]) => mockFindDocumentById(...args),
  shareDocument: (...args: any[]) => mockShareDocument(...args),
  moveDocument: (...args: any[]) => mockMoveDocument(...args),
  copyDocument: (...args: any[]) => mockCopyDocument(...args),
  deleteDocument: (...args: any[]) => mockDeleteDocument(...args)
}));

jest.mock('../../../src/utils/path-sanitizer', () => ({
  __esModule: true,
  validateDownloadPath: (...args: any[]) => mockValidateDownloadPath(...args)
}));

jest.mock('../../../src/services/membership.service', () => ({
  __esModule: true,
  hasActiveMembership: (...args: any[]) => mockHasActiveMembership(...args)
}));

jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    convertToHtml: (...args: any[]) => mockMammothConvertToHtml(...args)
  },
  convertToHtml: (...args: any[]) => mockMammothConvertToHtml(...args)
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
  const res: any = {};
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
  const ORG_ID = '507f1f77bcf86cd799439012';
  const DOC_ID = '507f1f77bcf86cd799439013';

  describe('upload', () => {
    it('should next 400 when file missing', async () => {
      const { upload } = require('../../../src/controllers/document.controller');
      const req: any = { file: undefined, body: {}, user: { id: USER_ID } };
      const res = makeRes();
      const next = makeNext();

      await upload(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockUploadDocument).not.toHaveBeenCalled();
    });

    it('should next 400 when folderId has invalid format', async () => {
      const { upload } = require('../../../src/controllers/document.controller');
      const req: any = {
        file: { filename: 'a.txt' },
        body: { folderId: 'not-an-objectid' },
        user: { id: USER_ID }
      };
      const res = makeRes();
      const next = makeNext();

      await upload(req, res, next);
    });

    it('should call service and return 201 on success', async () => {
      const { upload } = require('../../../src/controllers/document.controller');
      mockUploadDocument.mockResolvedValue({ _id: 'doc1' });

      const req: any = {
        file: { filename: 'a.txt' },
        body: { folderId: '507f1f77bcf86cd799439099' },
        user: { id: USER_ID }
      };
      const res = makeRes();
      const next = makeNext();

      await upload(req, res, next);

      expect(mockUploadDocument).toHaveBeenCalledWith({
        file: req.file,
        userId: USER_ID,
        folderId: '507f1f77bcf86cd799439099'
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
      const req: any = { file: undefined, params: { id: DOC_ID }, user: { id: USER_ID } };
      const res = makeRes();
      const next = makeNext();

      await replaceFile(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockReplaceDocumentFile).not.toHaveBeenCalled();
    });

    it('should map "Document not found" to 404', async () => {
      const { replaceFile } = require('../../../src/controllers/document.controller');
      mockReplaceDocumentFile.mockRejectedValue(new Error('Document not found'));

      const req: any = {
        file: { filename: 'a.txt' },
        params: { id: DOC_ID },
        user: { id: USER_ID }
      };
      const res = makeRes();
      const next = makeNext();

      await replaceFile(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return success json on success', async () => {
      const { replaceFile } = require('../../../src/controllers/document.controller');
      mockReplaceDocumentFile.mockResolvedValue({ _id: DOC_ID });

      const req: any = {
        file: { filename: 'a.txt' },
        params: { id: DOC_ID },
        user: { id: USER_ID }
      };
      const res = makeRes();
      const next = makeNext();

      await replaceFile(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document file replaced successfully' })
      );
    });
  });

  describe('list', () => {
    it('should return docs and count', async () => {
      const { list } = require('../../../src/controllers/document.controller');
      mockListDocuments.mockResolvedValue([{ _id: 1 }, { _id: 2 }]);

      const req: any = { user: { id: USER_ID } };
      const res = makeRes();
      const next = makeNext();

      await list(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 2, documents: expect.any(Array) })
      );
    });
  });

  describe('listSharedToMe', () => {
    it('should return docs and count', async () => {
      const { listSharedToMe } = require('../../../src/controllers/document.controller');
      mockListSharedDocumentsToUser.mockResolvedValue([{ _id: 1 }]);

      const req: any = { user: { id: USER_ID } };
      const res = makeRes();
      const next = makeNext();

      await listSharedToMe(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 1, documents: expect.any(Array) })
      );
    });
  });

  describe('getRecent', () => {
    it('should next 400 when organizationId missing', async () => {
      const { getRecent } = require('../../../src/controllers/document.controller');
      const req: any = { user: { id: USER_ID }, params: {}, query: {} };
      const res = makeRes();
      const next = makeNext();

      await getRecent(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockGetUserRecentDocuments).not.toHaveBeenCalled();
    });

    it('should next 400 when organizationId invalid', async () => {
      const { getRecent } = require('../../../src/controllers/document.controller');
      const req: any = { user: { id: USER_ID }, params: { organizationId: 'invalid' }, query: {} };
      const res = makeRes();
      const next = makeNext();

      await getRecent(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockGetUserRecentDocuments).not.toHaveBeenCalled();
    });

    it('should default limit=10 and return docs', async () => {
      const { getRecent } = require('../../../src/controllers/document.controller');
      mockGetUserRecentDocuments.mockResolvedValue([{ _id: 1 }, { _id: 2 }]);

      const req: any = { user: { id: USER_ID }, params: { organizationId: ORG_ID }, query: {} };
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

      const req: any = {
        user: { id: USER_ID },
        params: { organizationId: ORG_ID },
        query: { limit: '2' }
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

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow access for org doc when hasActiveMembership returns true', async () => {
      const { getById } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: new mongoose.Types.ObjectId(ORG_ID),
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: []
      });
      mockHasActiveMembership.mockResolvedValue(true);

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(mockHasActiveMembership).toHaveBeenCalledWith(USER_ID, ORG_ID);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should deny access for org doc when hasActiveMembership returns false', async () => {
      const { getById } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: new mongoose.Types.ObjectId(ORG_ID),
        uploadedBy: new mongoose.Types.ObjectId('507f1f77bcf86cd799439099'),
        sharedWith: []
      });
      mockHasActiveMembership.mockResolvedValue(false);

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
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
        sharedWith: []
      });

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
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
        uploadedBy: new mongoose.Types.ObjectId('507f1f77bcf86cd799439099'),
        sharedWith: [new mongoose.Types.ObjectId(USER_ID)]
      });

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await getById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('share', () => {
    it('should next 400 when userIds missing/invalid', async () => {
      const { share } = require('../../../src/controllers/document.controller');

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID }, body: {} };
      const res = makeRes();
      const next = makeNext();

      await share(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockShareDocument).not.toHaveBeenCalled();
    });

    it('should map "Document not found" to 404', async () => {
      const { share } = require('../../../src/controllers/document.controller');
      mockShareDocument.mockRejectedValue(new Error('Document not found'));

      const req: any = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: { userIds: [USER_ID] }
      };
      const res = makeRes();
      const next = makeNext();

      await share(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return success on valid request', async () => {
      const { share } = require('../../../src/controllers/document.controller');
      mockShareDocument.mockResolvedValue({ _id: DOC_ID });

      const req: any = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: { userIds: [USER_ID] }
      };
      const res = makeRes();
      const next = makeNext();

      await share(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document shared successfully' })
      );
    });
  });

  describe('move', () => {
    it('should next 400 when targetFolderId missing', async () => {
      const { move } = require('../../../src/controllers/document.controller');
      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID }, body: {} };
      const res = makeRes();
      const next = makeNext();

      await move(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockMoveDocument).not.toHaveBeenCalled();
    });

    it('should return success when service resolves', async () => {
      const { move } = require('../../../src/controllers/document.controller');
      mockMoveDocument.mockResolvedValue({ _id: DOC_ID });

      const req: any = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: { targetFolderId: '507f1f77bcf86cd799439099' }
      };
      const res = makeRes();
      const next = makeNext();

      await move(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document moved successfully' })
      );
    });
  });

  describe('copy', () => {
    it('should next 400 when targetFolderId missing', async () => {
      const { copy } = require('../../../src/controllers/document.controller');
      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID }, body: {} };
      const res = makeRes();
      const next = makeNext();

      await copy(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockCopyDocument).not.toHaveBeenCalled();
    });

    it('should return 201 when service resolves', async () => {
      const { copy } = require('../../../src/controllers/document.controller');
      mockCopyDocument.mockResolvedValue({ _id: 'newDoc' });

      const req: any = {
        user: { id: USER_ID },
        params: { id: DOC_ID },
        body: { targetFolderId: '507f1f77bcf86cd799439099' }
      };
      const res = makeRes();
      const next = makeNext();

      await copy(req, res, next);

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

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
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
        uploadedBy: new mongoose.Types.ObjectId('507f1f77bcf86cd799439099'),
        sharedWith: [],
        filename: 'a.pdf',
        originalname: 'a.pdf',
        path: '/obs/a.pdf'
      });
      mockHasActiveMembership.mockResolvedValue(false);

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await download(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockValidateDownloadPath).not.toHaveBeenCalled();
    });

    it('should download using uploads path if validateDownloadPath succeeds', async () => {
      const { download } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        filename: 'a.pdf',
        originalname: 'nice.pdf',
        path: '/org/a.pdf'
      });
      mockValidateDownloadPath.mockResolvedValue('/abs/uploads/a.pdf');

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await download(req, res, next);

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
        path: '/org/a.pdf'
      });

      mockValidateDownloadPath
        .mockRejectedValueOnce(new Error('nope'))
        .mockResolvedValueOnce('/abs/storage/org/a.pdf');

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await download(req, res, next);

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
        path: '/org/a.pdf'
      });

      mockValidateDownloadPath
        .mockRejectedValueOnce(new Error('no uploads'))
        .mockRejectedValueOnce(new Error('no storage'));

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
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

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should try alternative /obs path when first validate fails, then serve file inline', async () => {
      const { preview } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        path: 'org/file.pdf',
        originalname: 'file.pdf',
        mimeType: 'application/pdf'
      });

      mockValidateDownloadPath
        .mockRejectedValueOnce(new Error('fail first'))
        .mockResolvedValueOnce('/abs/storage/obs/org/file.pdf');

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('inline;')
      );
      expect(res.sendFile).toHaveBeenCalledWith('/abs/storage/obs/org/file.pdf');
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
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      mockValidateDownloadPath.mockResolvedValue('/abs/storage/org/file.docx');
      mockMammothConvertToHtml.mockResolvedValue({ value: '<p>Hello</p>' });

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<!DOCTYPE html>'));
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('<p>Hello</p>'));
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
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      mockValidateDownloadPath.mockResolvedValue('/abs/storage/org/file.docx');
      mockMammothConvertToHtml.mockRejectedValue(new Error('bad docx'));

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
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
        uploadedBy: new mongoose.Types.ObjectId('507f1f77bcf86cd799439099'),
        sharedWith: [],
        path: 'org/file.pdf',
        originalname: 'file.pdf',
        mimeType: 'application/pdf'
      });
      mockHasActiveMembership.mockResolvedValue(false);

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await preview(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockValidateDownloadPath).not.toHaveBeenCalled();
    });

    it('should next 404 when file not found after both path attempts', async () => {
      const { preview } = require('../../../src/controllers/document.controller');
      mockFindDocumentById.mockResolvedValue({
        _id: DOC_ID,
        organization: null,
        uploadedBy: new mongoose.Types.ObjectId(USER_ID),
        sharedWith: [],
        path: 'org/file.pdf',
        originalname: 'file.pdf',
        mimeType: 'application/pdf'
      });

      mockValidateDownloadPath
        .mockRejectedValueOnce(new Error('no'))
        .mockRejectedValueOnce(new Error('no2'));

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
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

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await remove(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return success json when deleted', async () => {
      const { remove } = require('../../../src/controllers/document.controller');
      mockDeleteDocument.mockResolvedValue({ _id: DOC_ID });

      const req: any = { user: { id: USER_ID }, params: { id: DOC_ID } };
      const res = makeRes();
      const next = makeNext();

      await remove(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: 'Document deleted successfully' })
      );
    });
  });
});

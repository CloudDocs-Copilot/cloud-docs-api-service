import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../../../src/middlewares/auth.middleware';
import {
  create,
  getUserTree,
  getContents,
  share,
  list,
  rename
} from '../../../src/controllers/folder.controller';
import * as folderService from '../../../src/services/folder.service';
import HttpError from '../../../src/models/error.model';

jest.mock('../../../src/services/folder.service');

describe('Folder Controller', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  const mockUserId = new mongoose.Types.ObjectId().toString();
  const mockOrgId = new mongoose.Types.ObjectId().toString();
  const mockFolderId = new mongoose.Types.ObjectId().toString();
  const mockParentId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    mockRequest = {
      user: { id: mockUserId, email: 'test@example.com' } as any,
      body: {},
      params: {},
      query: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create folder successfully', async () => {
      mockRequest.body = {
        name: 'test-folder',
        displayName: 'Test Folder',
        organizationId: mockOrgId,
        parentId: mockParentId
      };

      const mockFolder = {
        _id: mockFolderId,
        name: 'test-folder',
        displayName: 'Test Folder',
        owner: mockUserId,
        organization: mockOrgId
      };

      (folderService.createFolder as jest.Mock).mockResolvedValue(mockFolder);

      await create(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.createFolder).toHaveBeenCalledWith({
        name: 'test-folder',
        displayName: 'Test Folder',
        owner: mockUserId,
        organizationId: mockOrgId,
        parentId: mockParentId
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Folder created successfully',
        folder: mockFolder
      });
    });

    it('should return 400 when name is missing', async () => {
      mockRequest.body = {
        organizationId: mockOrgId,
        parentId: mockParentId
      };

      await create(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Folder name is required'));
      expect(folderService.createFolder).not.toHaveBeenCalled();
    });

    it('should return 400 when organizationId is missing', async () => {
      mockRequest.body = {
        name: 'test-folder',
        parentId: mockParentId
      };

      await create(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Organization ID is required'));
    });

    it('should return 400 when parentId is missing', async () => {
      mockRequest.body = {
        name: 'test-folder',
        organizationId: mockOrgId
      };

      await create(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Parent folder ID is required'));
    });

    it('should handle service errors', async () => {
      mockRequest.body = {
        name: 'test-folder',
        organizationId: mockOrgId,
        parentId: mockParentId
      };

      const error = new Error('Database error');
      (folderService.createFolder as jest.Mock).mockRejectedValue(error);

      await create(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should create folder without displayName', async () => {
      mockRequest.body = {
        name: 'test-folder',
        organizationId: mockOrgId,
        parentId: mockParentId
      };

      const mockFolder = { _id: mockFolderId, name: 'test-folder' };
      (folderService.createFolder as jest.Mock).mockResolvedValue(mockFolder);

      await create(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.createFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-folder',
          displayName: undefined
        })
      );
    });
  });

  describe('getUserTree', () => {
    it('should get user folder tree successfully', async () => {
      mockRequest.query = { organizationId: mockOrgId };

      const mockTree = {
        _id: mockFolderId,
        name: 'root',
        children: []
      };

      (folderService.getUserFolderTree as jest.Mock).mockResolvedValue(mockTree);

      await getUserTree(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.getUserFolderTree).toHaveBeenCalledWith({
        userId: mockUserId,
        organizationId: mockOrgId
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        tree: mockTree
      });
    });

    it('should return 400 when organizationId is missing', async () => {
      mockRequest.query = {};

      await getUserTree(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Organization ID is required'));
    });

    it('should return 400 when organizationId is invalid', async () => {
      mockRequest.query = { organizationId: 'invalid-id' };

      await getUserTree(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Invalid Organization ID'));
    });

    it('should return 404 when user has no root folder', async () => {
      mockRequest.query = { organizationId: mockOrgId };

      (folderService.getUserFolderTree as jest.Mock).mockResolvedValue(null);

      await getUserTree(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(404, 'User has no root folder in this organization')
      );
    });

    it('should normalize organizationId to ObjectId', async () => {
      mockRequest.query = { organizationId: mockOrgId };

      const mockTree = { _id: mockFolderId, name: 'root' };
      (folderService.getUserFolderTree as jest.Mock).mockResolvedValue(mockTree);

      await getUserTree(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.getUserFolderTree).toHaveBeenCalledWith({
        userId: mockUserId,
        organizationId: expect.any(String)
      });
    });

    it('should handle service errors', async () => {
      mockRequest.query = { organizationId: mockOrgId };

      const error = new Error('Database error');
      (folderService.getUserFolderTree as jest.Mock).mockRejectedValue(error);

      await getUserTree(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getContents', () => {
    it('should get folder contents successfully', async () => {
      mockRequest.params = { id: mockFolderId };

      const mockContents = {
        folders: [{ _id: '1', name: 'subfolder1' }],
        documents: [{ _id: '2', filename: 'doc1.pdf' }]
      };

      (folderService.getFolderContents as jest.Mock).mockResolvedValue(mockContents);

      await getContents(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.getFolderContents).toHaveBeenCalledWith({
        folderId: mockFolderId,
        userId: mockUserId
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        contents: mockContents
      });
    });

    it('should handle empty folder', async () => {
      mockRequest.params = { id: mockFolderId };

      const mockContents = {
        folders: [],
        documents: []
      };

      (folderService.getFolderContents as jest.Mock).mockResolvedValue(mockContents);

      await getContents(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        contents: mockContents
      });
    });

    it('should handle service errors', async () => {
      mockRequest.params = { id: mockFolderId };

      const error = new Error('Folder not found');
      (folderService.getFolderContents as jest.Mock).mockRejectedValue(error);

      await getContents(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('share', () => {
    it('should share folder with viewer role', async () => {
      const targetUserId = new mongoose.Types.ObjectId().toString();
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        targetUserId,
        role: 'viewer'
      };

      const mockSharedFolder = { _id: mockFolderId, sharedWith: [targetUserId] };
      (folderService.shareFolder as jest.Mock).mockResolvedValue(mockSharedFolder);

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.shareFolder).toHaveBeenCalledWith({
        folderId: mockFolderId,
        userId: mockUserId,
        targetUserId,
        role: 'viewer'
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Folder shared successfully',
        folder: mockSharedFolder
      });
    });

    it('should share folder with editor role', async () => {
      const targetUserId = new mongoose.Types.ObjectId().toString();
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        targetUserId,
        role: 'editor'
      };

      const mockSharedFolder = { _id: mockFolderId, sharedWith: [targetUserId] };
      (folderService.shareFolder as jest.Mock).mockResolvedValue(mockSharedFolder);

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.shareFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'editor'
        })
      );
    });

    it('should accept numeric role values', async () => {
      const targetUserId = new mongoose.Types.ObjectId().toString();
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        targetUserId,
        role: 1 // 1 = viewer
      };

      const mockSharedFolder = { _id: mockFolderId };
      (folderService.shareFolder as jest.Mock).mockResolvedValue(mockSharedFolder);

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.shareFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'viewer'
        })
      );
    });

    it('should convert numeric role 2 to editor', async () => {
      const targetUserId = new mongoose.Types.ObjectId().toString();
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        targetUserId,
        role: 2 // 2 = editor
      };

      const mockSharedFolder = { _id: mockFolderId };
      (folderService.shareFolder as jest.Mock).mockResolvedValue(mockSharedFolder);

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.shareFolder).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'editor'
        })
      );
    });

    it('should return 400 when trying to share with owner role (numeric 3)', async () => {
      const targetUserId = new mongoose.Types.ObjectId().toString();
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        targetUserId,
        role: 3 // 3 = owner (not allowed)
      };

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Cannot share folder with owner role')
      );
    });

    it('should return 400 when targetUserId is missing', async () => {
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        role: 'viewer'
      };

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Target user ID is required'));
    });

    it('should return 400 when targetUserId is invalid', async () => {
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        targetUserId: 'invalid-id',
        role: 'viewer'
      };

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Invalid target user ID'));
    });

    it('should return 400 when role is missing', async () => {
      const targetUserId = new mongoose.Types.ObjectId().toString();
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        targetUserId
      };

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Role is required'));
    });

    it('should return 400 for invalid string role', async () => {
      const targetUserId = new mongoose.Types.ObjectId().toString();
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        targetUserId,
        role: 'admin' // Invalid role
      };

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Valid role (viewer/editor) is required')
      );
    });

    it('should return 400 for invalid numeric role', async () => {
      const targetUserId = new mongoose.Types.ObjectId().toString();
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        targetUserId,
        role: 5 // Invalid numeric role
      };

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new HttpError(400, 'Invalid role value'));
    });

    it('should accept legacy userId parameter', async () => {
      const targetUserId = new mongoose.Types.ObjectId().toString();
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        userId: targetUserId, // Legacy parameter name
        role: 'viewer'
      };

      const mockSharedFolder = { _id: mockFolderId };
      (folderService.shareFolder as jest.Mock).mockResolvedValue(mockSharedFolder);

      await share(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.shareFolder).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should list user folders successfully', async () => {
      const mockFolders = [
        { _id: '1', name: 'folder1' },
        { _id: '2', name: 'folder2' }
      ];

      (folderService.listFolders as jest.Mock).mockResolvedValue(mockFolders);

      await list(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.listFolders).toHaveBeenCalledWith(mockUserId);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        folders: mockFolders
      });
    });

    it('should return empty array when user has no folders', async () => {
      (folderService.listFolders as jest.Mock).mockResolvedValue([]);

      await list(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        folders: []
      });
    });

    it('should handle service errors', async () => {
      const error = new Error('Database error');
      (folderService.listFolders as jest.Mock).mockRejectedValue(error);

      await list(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('rename', () => {
    it('should rename folder with name', async () => {
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = { name: 'new-folder-name' };

      const mockRenamedFolder = { _id: mockFolderId, name: 'new-folder-name' };
      (folderService.renameFolder as jest.Mock).mockResolvedValue(mockRenamedFolder);

      await rename(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.renameFolder).toHaveBeenCalledWith({
        id: mockFolderId,
        userId: mockUserId,
        name: 'new-folder-name',
        displayName: undefined
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Folder renamed successfully',
        folder: mockRenamedFolder
      });
    });

    it('should rename folder with displayName', async () => {
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = { displayName: 'New Display Name' };

      const mockRenamedFolder = { _id: mockFolderId, displayName: 'New Display Name' };
      (folderService.renameFolder as jest.Mock).mockResolvedValue(mockRenamedFolder);

      await rename(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.renameFolder).toHaveBeenCalledWith({
        id: mockFolderId,
        userId: mockUserId,
        name: undefined,
        displayName: 'New Display Name'
      });
    });

    it('should rename folder with both name and displayName', async () => {
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {
        name: 'new-name',
        displayName: 'New Display Name'
      };

      const mockRenamedFolder = {
        _id: mockFolderId,
        name: 'new-name',
        displayName: 'New Display Name'
      };
      (folderService.renameFolder as jest.Mock).mockResolvedValue(mockRenamedFolder);

      await rename(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.renameFolder).toHaveBeenCalledWith({
        id: mockFolderId,
        userId: mockUserId,
        name: 'new-name',
        displayName: 'New Display Name'
      });
    });

    it('should return 400 when neither name nor displayName is provided', async () => {
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = {};

      await rename(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        new HttpError(400, 'Name or displayName is required')
      );
    });

    it('should handle service errors', async () => {
      mockRequest.params = { id: mockFolderId };
      mockRequest.body = { name: 'new-name' };

      const error = new Error('Folder not found');
      (folderService.renameFolder as jest.Mock).mockRejectedValue(error);

      await rename(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing user in request', async () => {
      mockRequest.user = undefined;
      mockRequest.body = {
        name: 'test-folder',
        organizationId: mockOrgId,
        parentId: mockParentId
      };

      await create(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      // Should handle gracefully or throw error
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle very long folder names', async () => {
      mockRequest.body = {
        name: 'a'.repeat(1000),
        organizationId: mockOrgId,
        parentId: mockParentId
      };

      const error = new Error('Name too long');
      (folderService.createFolder as jest.Mock).mockRejectedValue(error);

      await create(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle special characters in folder names', async () => {
      mockRequest.body = {
        name: 'folder-with-$pecial-ch@rs',
        organizationId: mockOrgId,
        parentId: mockParentId
      };

      const mockFolder = { _id: mockFolderId, name: 'folder-with-$pecial-ch@rs' };
      (folderService.createFolder as jest.Mock).mockResolvedValue(mockFolder);

      await create(mockRequest as AuthRequest, mockResponse as Response, mockNext);

      expect(folderService.createFolder).toHaveBeenCalled();
    });
  });
});

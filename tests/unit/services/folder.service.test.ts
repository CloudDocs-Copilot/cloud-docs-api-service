import mongoose from 'mongoose';

// Ensure mocks are applied before loading the service module
jest.resetModules();
jest.mock('../../../src/models/folder.model', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  exists: jest.fn(),
  create: jest.fn(),
  findByIdAndDelete: jest.fn()
}));
jest.mock('../../../src/models/user.model', () => ({ findById: jest.fn() }));
jest.mock('../../../src/models/organization.model', () => ({ findById: jest.fn() }));
jest.mock('../../../src/models/document.model', () => ({ find: jest.fn(), exists: jest.fn(), findByIdAndDelete: jest.fn() }));

const folderService = require('../../../src/services/folder.service');

describe('folder.service (unit)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('validateFolderAccess throws 400 for invalid id', async () => {
    await expect(folderService.validateFolderAccess('bad-id', 'user'))
      .rejects.toThrow('Invalid folder ID');
  });

  it('validateFolderAccess throws 404 when folder not found', async () => {
    const Folder = require('../../../src/models/folder.model');
    Folder.findById = jest.fn().mockResolvedValue(null);

    const id = new mongoose.Types.ObjectId().toString();
    await expect(folderService.validateFolderAccess(id, 'user'))
      .rejects.toThrow('Folder not found');
  });

  it('validateFolderAccess throws 403 when no access', async () => {
    const Folder = require('../../../src/models/folder.model');
    Folder.findById = jest.fn().mockResolvedValue({ hasAccess: () => false });

    const id = new mongoose.Types.ObjectId().toString();
    await expect(folderService.validateFolderAccess(id, 'user'))
      .rejects.toThrow('User does not have access to this folder');
  });

  it('validateFolderAccess returns true when has access', async () => {
    const Folder = require('../../../src/models/folder.model');
    Folder.findById = jest.fn().mockResolvedValue({ hasAccess: () => true });

    const id = new mongoose.Types.ObjectId().toString();
    const res = await folderService.validateFolderAccess(id, 'user');
    expect(res).toBe(true);
  });

  it('getUserFolderTree returns null when no folders', async () => {
    const Folder = require('../../../src/models/folder.model');
    Folder.find = jest.fn().mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([]) }) });

    const res = await folderService.getUserFolderTree({ userId: new mongoose.Types.ObjectId().toString(), organizationId: new mongoose.Types.ObjectId().toString() });
    expect(res).toBeNull();
  });

  it('getUserFolderTree builds a tree', async () => {
    const Folder = require('../../../src/models/folder.model');
    const rootId = new mongoose.Types.ObjectId();
    const childId = new mongoose.Types.ObjectId();
    const folders = [
      { _id: rootId, parent: null, path: '/root', name: 'root' },
      { _id: childId, parent: rootId, path: '/root/child', name: 'child' }
    ];
    Folder.find = jest.fn().mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(folders) }) });

    const res = await folderService.getUserFolderTree({ userId: new mongoose.Types.ObjectId().toString(), organizationId: new mongoose.Types.ObjectId().toString() });
    expect(res).toBeDefined();
    expect((res as any).children).toHaveLength(1);
    expect((res as any).children[0].name).toBe('child');
  });

  it('createFolder validates required fields', async () => {
    await expect(folderService.createFolder({ name: '', owner: '', organizationId: '', parentId: '' } as any))
      .rejects.toThrow('Folder name is required');
  });
});

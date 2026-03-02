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
jest.mock('../../../src/models/document.model', () => ({
  find: jest.fn(),
  exists: jest.fn(),
  findByIdAndDelete: jest.fn()
}));

// Do not require the service module at top-level; require inside each test
// after configuring model mocks to ensure fresh module state per test.

describe('folder.service (unit)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('validateFolderAccess throws 400 for invalid id', async (): Promise<void> => {
    const mod = await import('../../../src/services/folder.service');
    const folderService = mod as unknown as typeof import('../../../src/services/folder.service');
    await expect(folderService.validateFolderAccess('bad-id', 'user')).rejects.toThrow(
      'ID de carpeta inválido'
    );
  });

  it('validateFolderAccess throws 404 when folder not found', async (): Promise<void> => {
    const Folder = await import('../../../src/models/folder.model');
    (Folder as unknown as { findById: jest.Mock }).findById.mockResolvedValue(null);

    const id = new mongoose.Types.ObjectId().toString();
    const mod = await import('../../../src/services/folder.service');
    const folderService = mod as unknown as typeof import('../../../src/services/folder.service');
    await expect(folderService.validateFolderAccess(id, 'user')).rejects.toThrow(
      'Carpeta no encontrada'
    );
  });

  it('validateFolderAccess throws 403 when no access', async (): Promise<void> => {
    const Folder = await import('../../../src/models/folder.model');
    (Folder as unknown as { findById: jest.Mock }).findById.mockResolvedValue({ hasAccess: () => false });

    const id = new mongoose.Types.ObjectId().toString();
    const mod = await import('../../../src/services/folder.service');
    const folderService = mod as unknown as typeof import('../../../src/services/folder.service');
    await expect(folderService.validateFolderAccess(id, 'user')).rejects.toThrow(
      'El usuario no tiene acceso a esta carpeta'
    );
  });

  it('validateFolderAccess returns true when has access', async (): Promise<void> => {
    const Folder = await import('../../../src/models/folder.model');
    (Folder as unknown as { findById: jest.Mock }).findById.mockResolvedValue({ hasAccess: () => true });

    const id = new mongoose.Types.ObjectId().toString();
    const mod = await import('../../../src/services/folder.service');
    const folderService = mod as unknown as typeof import('../../../src/services/folder.service');
    const res = await folderService.validateFolderAccess(id, 'user');
    expect(res).toBe(true);
  });

  it('getUserFolderTree returns null when no folders', async (): Promise<void> => {
    const Folder = await import('../../../src/models/folder.model');
    (Folder as unknown as { find: jest.Mock }).find.mockReturnValue({ 
      sort: jest.fn().mockReturnValue({ 
        lean: jest.fn().mockResolvedValue([]) 
      }) 
    } as unknown);

    const mod = await import('../../../src/services/folder.service');
    const folderService = mod as unknown as typeof import('../../../src/services/folder.service');

    const res = await folderService.getUserFolderTree({
      userId: new mongoose.Types.ObjectId().toString(),
      organizationId: new mongoose.Types.ObjectId().toString()
    });
    expect(res).toBeNull();
  });

  it('getUserFolderTree builds a tree', async (): Promise<void> => {
    const Folder = await import('../../../src/models/folder.model');
    const Document = await import('../../../src/models/document.model');
    const rootId = new mongoose.Types.ObjectId();
    const childId = new mongoose.Types.ObjectId();
    // Con lean() los objetos son planos, sin toObject()
    const folders = [
      {
        _id: rootId,
        parent: null,
        path: '/root',
        name: 'root'
      },
      {
        _id: childId,
        parent: rootId,
        path: '/root/child',
        name: 'child'
      }
    ];
    (Folder as unknown as { find: jest.Mock }).find.mockReturnValue({ 
      sort: jest.fn().mockReturnValue({ 
        lean: jest.fn().mockResolvedValue(folders) 
      }) 
    } as unknown);
    
    // Mock DocumentModel.find para que no falle
    (Document as unknown as { default: { find: jest.Mock } }).default.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([])
        })
      })
    });

    const mod = await import('../../../src/services/folder.service');
    const folderService = mod as unknown as typeof import('../../../src/services/folder.service');

    const res = await folderService.getUserFolderTree({
      userId: new mongoose.Types.ObjectId().toString(),
      organizationId: new mongoose.Types.ObjectId().toString()
    });
    expect(res).toBeDefined();
    expect((res as unknown as { children: Array<{ name: string }> }).children).toHaveLength(1);
    expect((res as unknown as { children: Array<{ name: string }> }).children[0].name).toBe('child');
  });

  it('createFolder validates required fields', async (): Promise<void> => {
    const mod = await import('../../../src/services/folder.service');
    const folderService = mod as unknown as typeof import('../../../src/services/folder.service');
    await expect(
      folderService.createFolder({ name: '', owner: '', organizationId: '', parentId: '' } as unknown as { name: string; owner: string; organizationId: string; parentId: string })
    ).rejects.toThrow('El nombre de la carpeta es requerido');
  });
});

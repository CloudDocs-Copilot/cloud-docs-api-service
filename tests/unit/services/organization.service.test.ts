// Ensure mocks are applied before loading the service module
jest.resetModules();
jest.mock('../../../src/models/user.model', () => ({ findById: jest.fn() }));
jest.mock('../../../src/models/organization.model', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn()
}));

let orgService: typeof import('../../../src/services/organization.service');

describe('organization.service (unit)', () => {
  beforeAll(async () => {
    orgService = (await import('../../../src/services/organization.service')) as unknown as typeof import('../../../src/services/organization.service');
  });

  afterEach(() => jest.restoreAllMocks());

  it('createOrganization throws 404 when owner not found', async () => {
    const User = await import('../../../src/models/user.model');
    (User as any).findById.mockResolvedValue(null);

    await expect(
      orgService.createOrganization({ name: 'X', ownerId: '507f1f77bcf86cd799439011' } as any)
    ).rejects.toThrow('Owner user not found');
  });

  it('getOrganizationById throws 404 when not found', async () => {
    const Organization = await import('../../../src/models/organization.model');
    (Organization as any).findById.mockReturnValue({ populate: () => ({ populate: () => Promise.resolve(null) }) });

    await expect(orgService.getOrganizationById('507f1f77bcf86cd799439011')).rejects.toThrow(
      'Organization not found'
    );
  });

  it('getOrganizationStorageStats throws 404 when org not found', async () => {
    const Organization = await import('../../../src/models/organization.model');
    (Organization as any).findById.mockResolvedValue(null);

    await expect(
      orgService.getOrganizationStorageStats('507f1f77bcf86cd799439011')
    ).rejects.toThrow('Organization not found');
  });
});

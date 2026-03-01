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
  beforeAll(async (): Promise<void> => {
    orgService = (await import('../../../src/services/organization.service')) as unknown as typeof import('../../../src/services/organization.service');
  });

  afterEach((): void => jest.restoreAllMocks());

  it('createOrganization throws 404 when owner not found', async (): Promise<void> => {
    const User = await import('../../../src/models/user.model');
    (User as unknown as { findById: jest.Mock }).findById.mockResolvedValue(null);

    await expect(
      orgService.createOrganization({ name: 'X', ownerId: '507f1f77bcf86cd799439011' } as unknown as { name: string; ownerId: string })
    ).rejects.toThrow('Owner user not found');
  });

  it('getOrganizationById throws 404 when not found', async (): Promise<void> => {
    const Organization = await import('../../../src/models/organization.model');
    (Organization as unknown as { findById: jest.Mock }).findById.mockReturnValue({ populate: () => ({ populate: () => Promise.resolve(null) }) } as unknown);

    await expect(orgService.getOrganizationById('507f1f77bcf86cd799439011')).rejects.toThrow(
      'Organization not found'
    );
  });

  it('getOrganizationStorageStats throws 404 when org not found', async (): Promise<void> => {
    const Organization = await import('../../../src/models/organization.model');
    (Organization as unknown as { findById: jest.Mock }).findById.mockResolvedValue(null);

    await expect(orgService.getOrganizationStorageStats('507f1f77bcf86cd799439011')).rejects.toThrow(
      'Organization not found'
    );
  });
});

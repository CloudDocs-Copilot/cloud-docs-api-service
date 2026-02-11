// Ensure mocks are applied before loading the service module
jest.resetModules();
jest.mock('../../../src/models/user.model', () => ({ findById: jest.fn() }));
jest.mock('../../../src/models/organization.model', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn()
}));

const orgService = require('../../../src/services/organization.service');

describe('organization.service (unit)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('createOrganization throws 404 when owner not found', async () => {
    const User = require('../../../src/models/user.model');
    User.findById = jest.fn().mockResolvedValue(null);

    await expect(orgService.createOrganization({ name: 'X', ownerId: '507f1f77bcf86cd799439011' } as any))
      .rejects.toThrow('Owner user not found');
  });

  it('getOrganizationById throws 404 when not found', async () => {
    const Organization = require('../../../src/models/organization.model');
    Organization.findById = jest.fn().mockReturnValue({ populate: () => ({ populate: () => Promise.resolve(null) }) });

    await expect(orgService.getOrganizationById('507f1f77bcf86cd799439011'))
      .rejects.toThrow('Organization not found');
  });

  it('getOrganizationStorageStats throws 404 when org not found', async () => {
    const Organization = require('../../../src/models/organization.model');
    Organization.findById = jest.fn().mockResolvedValue(null);

    await expect(orgService.getOrganizationStorageStats('507f1f77bcf86cd799439011'))
      .rejects.toThrow('Organization not found');
  });
});

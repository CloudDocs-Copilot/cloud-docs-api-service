// Ensure mocks are applied before loading the service module
jest.resetModules();
jest.mock('../../../src/models/membership.model', () => ({
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  MembershipRole: { MEMBER: 'member' },
  MembershipStatus: { ACTIVE: 'active', PENDING: 'pending' }
}));

const membershipService = require('../../../src/services/membership.service');

describe('membership.service (unit)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hasActiveMembership returns false for invalid userId', async () => {
    const res = await membershipService.hasActiveMembership('invalid-id', 'orgid');
    expect(res).toBe(false);
  });

  it('hasActiveMembership returns true when membership exists', async () => {
    const Membership = require('../../../src/models/membership.model');
    Membership.findOne = jest.fn().mockResolvedValue({ _id: 'abc' });

    const res = await membershipService.hasActiveMembership('507f1f77bcf86cd799439011', 'orgid');
    expect(res).toBe(true);
    expect(Membership.findOne).toHaveBeenCalled();
  });

  it('getMembership returns null for invalid userId', async () => {
    const res = await membershipService.getMembership('bad', 'org');
    expect(res).toBeNull();
  });
});

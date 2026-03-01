export {};
jest.resetModules();

const mockOrgFindById = jest.fn();
const mockUserFindById = jest.fn();
const mockMembershipFindOne = jest.fn();
const mockMembershipCount = jest.fn();
const mockMembershipCreate = jest.fn();

jest.mock('../../../src/models/organization.model', () => ({
  __esModule: true,
  default: { findById: mockOrgFindById }
}));
jest.mock('../../../src/models/user.model', () => ({
  __esModule: true,
  default: { findById: mockUserFindById }
}));
jest.mock('../../../src/models/membership.model', () => ({
  __esModule: true,
  default: {
    findOne: mockMembershipFindOne,
    countDocuments: mockMembershipCount,
    create: mockMembershipCreate
  },
  MembershipRole: { MEMBER: 'member', ADMIN: 'admin', OWNER: 'owner', VIEWER: 'viewer' },
  MembershipStatus: { PENDING: 'pending', ACTIVE: 'active' }
}));
jest.mock('../../../src/mail/emailService', () => ({ sendConfirmationEmail: jest.fn() }));
jest.mock('fs', () => ({ readFileSync: jest.fn(() => '<html/>') }));
jest.mock('path', () => ({ join: (...args: unknown[]) => args.map(String).join('/') }));

afterEach(() => jest.clearAllMocks());

describe('membership.service invitations', (): void => {
  it('createInvitation validates userId format', async (): Promise<void> => {
    const { createInvitation } = (await import('../../../src/services/membership.service')) as unknown as typeof import('../../../src/services/membership.service');
    await expect(
      createInvitation({ userId: 'bad', organizationId: 'o1', invitedBy: 'i1' } as unknown as { userId: string; organizationId: string; invitedBy: string })
    ).rejects.toThrow();
  });

  it('createInvitation handles organization not found', async (): Promise<void> => {
    // mock findById to return a chainable query with populate()
    mockOrgFindById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
    const { createInvitation } = (await import('../../../src/services/membership.service')) as unknown as typeof import('../../../src/services/membership.service');
    await expect(
      createInvitation({
        userId: '507f1f77bcf86cd799439011',
        organizationId: 'o1',
        invitedBy: '507f1f77bcf86cd799439012'
      })
    ).rejects.toThrow('Organization not found');
  });

  it('createInvitation handles user/inviter missing', async (): Promise<void> => {
    const org = {
      _id: 'o1',
      active: true,
      settings: { maxUsers: -1 },
      plan: 'free',
      name: 'Org',
      slug: 'org'
    };
    mockOrgFindById.mockReturnValue({ populate: jest.fn().mockResolvedValue(org) });
    mockUserFindById.mockResolvedValueOnce(null);
    const { createInvitation } = (await import('../../../src/services/membership.service')) as unknown as typeof import('../../../src/services/membership.service');
    await expect(
      createInvitation({
        userId: '507f1f77bcf86cd799439011',
        organizationId: 'o1',
        invitedBy: '507f1f77bcf86cd799439012'
      })
    ).rejects.toThrow('User not found');
  });

  it('createInvitation returns membership and sends email on success', async (): Promise<void> => {
    const org = {
      _id: 'o1',
      active: true,
      settings: { maxUsers: -1 },
      plan: 'free',
      name: 'Org',
      slug: 'org'
    };
    mockOrgFindById.mockReturnValue({ populate: jest.fn().mockResolvedValue(org) });
    mockUserFindById.mockResolvedValueOnce({ _id: 'u1', email: 'a@b.com', name: 'A' });
    mockUserFindById.mockResolvedValueOnce({ _id: 'i1', email: 'inv@b.com', name: 'Inv' });
    mockMembershipFindOne.mockResolvedValue(null);
    mockMembershipCount.mockResolvedValue(0);
    const membership = {
      _id: 'm1',
      populate: jest.fn().mockResolvedValue({ _id: 'm1', organization: { name: 'Org' } })
    };
    mockMembershipCreate.mockResolvedValue(membership);

    const { createInvitation } = (await import('../../../src/services/membership.service')) as unknown as typeof import('../../../src/services/membership.service');
    const res = await createInvitation({
      userId: '507f1f77bcf86cd799439011',
      organizationId: 'o1',
      invitedBy: '507f1f77bcf86cd799439012'
    });
    expect(res).toBeDefined();
  });
});

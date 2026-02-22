jest.resetModules();

const mockOrgFindById = jest.fn();
const mockHasActiveMembership = jest.fn();
const mockGetMembership = jest.fn();
const mockGetActiveOrganization = jest.fn();

jest.mock('../../../src/models/organization.model', () => ({
  __esModule: true,
  default: { findById: mockOrgFindById }
}));
jest.mock('../../../src/services/membership.service', () => ({
  hasActiveMembership: (...args: any[]) => mockHasActiveMembership(...args),
  getMembership: (...args: any[]) => mockGetMembership(...args),
  getActiveOrganization: (...args: any[]) => mockGetActiveOrganization(...args)
}));

afterEach(() => jest.clearAllMocks());

describe('organization.middleware', () => {
  it('validateOrganizationMembership returns 400 when no id', async () => {
    const mw =
      require('../../../src/middlewares/organization.middleware').validateOrganizationMembership(
        'body'
      );
    const req: any = { body: {} };
    const next = jest.fn();
    await mw(req, {} as any, next);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  it('validateOrganizationMembership returns 404 when org not found', async () => {
    mockOrgFindById.mockResolvedValue(null);
    const mw =
      require('../../../src/middlewares/organization.middleware').validateOrganizationMembership(
        'body'
      );
    const req: any = { body: { organizationId: 'o1' }, user: { id: 'u1' } };
    const next = jest.fn();
    await mw(req, {} as any, next);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });

  it('validateOrganizationMembership returns 403 when org inactive', async () => {
    mockOrgFindById.mockResolvedValue({ _id: 'o1', active: false });
    const mw =
      require('../../../src/middlewares/organization.middleware').validateOrganizationMembership(
        'body'
      );
    const req: any = { body: { organizationId: 'o1' }, user: { id: 'u1' } };
    const next = jest.fn();
    await mw(req, {} as any, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('validateOrganizationMembership attaches org when active member', async () => {
    mockOrgFindById.mockResolvedValue({ _id: 'o1', active: true });
    mockHasActiveMembership.mockResolvedValue(true);
    const mw =
      require('../../../src/middlewares/organization.middleware').validateOrganizationMembership(
        'body'
      );
    const req: any = { body: { organizationId: 'o1' }, user: { id: 'u1' } };
    const next = jest.fn();
    await mw(req, {} as any, next);
    expect(req.organization).toBeDefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('validateOrganizationOwnership allows owner', async () => {
    mockGetMembership.mockResolvedValue({ role: 'owner' });
    const {
      validateOrganizationOwnership
    } = require('../../../src/middlewares/organization.middleware');
    const req: any = { organization: { _id: 'o1' }, user: { id: 'u1' } };
    const next = jest.fn();
    await validateOrganizationOwnership(req, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('validateOrganizationOwnership denies non-owner', async () => {
    mockGetMembership.mockResolvedValue({ role: 'member' });
    const {
      validateOrganizationOwnership
    } = require('../../../src/middlewares/organization.middleware');
    const req: any = { organization: { _id: 'o1' }, user: { id: 'u1' } };
    const next = jest.fn();
    await validateOrganizationOwnership(req, {} as any, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('requireActiveOrganization returns 403 when no active org', async () => {
    mockGetActiveOrganization.mockResolvedValue(null);
    const {
      requireActiveOrganization
    } = require('../../../src/middlewares/organization.middleware');
    const req: any = { user: { id: 'u1' } };
    const next = jest.fn();
    await requireActiveOrganization(req, {} as any, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('requireActiveOrganization attaches organization when found and active', async () => {
    mockGetActiveOrganization.mockResolvedValue('o1');
    mockOrgFindById.mockResolvedValue({ _id: 'o1', active: true });
    const {
      requireActiveOrganization
    } = require('../../../src/middlewares/organization.middleware');
    const req: any = { user: { id: 'u1' } };
    const next = jest.fn();
    await requireActiveOrganization(req, {} as any, next);
    expect(req.organization).toBeDefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('validateMinimumRole denies when role too low', async () => {
    mockGetMembership.mockResolvedValue({ role: 'member' });
    const { validateMinimumRole } = require('../../../src/middlewares/organization.middleware');
    const mw = validateMinimumRole('admin' as any);
    const req: any = { organization: { _id: 'o1' }, user: { id: 'u1' } };
    const next = jest.fn();
    await mw(req, {} as any, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('validateMinimumRole allows when sufficient role', async () => {
    mockGetMembership.mockResolvedValue({ role: 'owner' });
    const { validateMinimumRole } = require('../../../src/middlewares/organization.middleware');
    const mw = validateMinimumRole('admin' as any);
    const req: any = { organization: { _id: 'o1' }, user: { id: 'u1' } };
    const next = jest.fn();
    await mw(req, {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });
});

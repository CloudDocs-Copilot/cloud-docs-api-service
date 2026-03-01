jest.resetModules();

const mockOrgFindById = jest.fn<Promise<null | { _id: string; active: boolean }>, [string]>();
const mockHasActiveMembership = jest.fn<Promise<boolean>, [string, string?]>();
const mockGetMembership = jest.fn<Promise<null | { role: string }>, [string, string?]>();
const mockGetActiveOrganization = jest.fn<Promise<null | string>, [string]>();

jest.mock('../../../src/models/organization.model', () => ({
  __esModule: true,
  default: { findById: mockOrgFindById }
}));
jest.mock('../../../src/services/membership.service', () => ({
  hasActiveMembership: mockHasActiveMembership,
  getMembership: mockGetMembership,
  getActiveOrganization: mockGetActiveOrganization
}));

import type { Request, Response, NextFunction } from 'express';
import {
  validateOrganizationMembership,
  validateOrganizationOwnership,
  requireActiveOrganization,
  validateMinimumRole
} from '../../../src/middlewares/organization.middleware';
import { MembershipRole } from '../../../src/models/membership.model';

afterEach(() => jest.clearAllMocks());

describe('organization.middleware', (): void => {
  it('validateOrganizationMembership returns 400 when no id', async (): Promise<void> => {
    const mw = validateOrganizationMembership('body');
    const req = { body: {} } as Partial<Request>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await mw(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    const callArg = next.mock.calls[0][0] as unknown as { statusCode?: number } | undefined;
    expect(callArg?.statusCode).toBe(400);
  });

  it('validateOrganizationMembership returns 404 when org not found', async (): Promise<void> => {
    mockOrgFindById.mockResolvedValue(null);
    const mw = validateOrganizationMembership('body');
    const req = { body: { organizationId: 'o1' }, user: { id: 'u1' } } as Partial<Request>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await mw(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    const callArg = next.mock.calls[0][0] as unknown as { statusCode?: number } | undefined;
    expect(callArg?.statusCode).toBe(404);
  });

  it('validateOrganizationMembership returns 403 when org inactive', async (): Promise<void> => {
    mockOrgFindById.mockResolvedValue({ _id: 'o1', active: false });
    const mw = validateOrganizationMembership('body');
    const req = { body: { organizationId: 'o1' }, user: { id: 'u1' } } as Partial<Request>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await mw(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    const callArg = next.mock.calls[0][0] as unknown as { statusCode?: number } | undefined;
    expect(callArg?.statusCode).toBe(403);
  });

  it('validateOrganizationMembership attaches org when active member', async (): Promise<void> => {
    mockOrgFindById.mockResolvedValue({ _id: 'o1', active: true });
    mockHasActiveMembership.mockResolvedValue(true);
    const mw = validateOrganizationMembership('body');
    const req = { body: { organizationId: 'o1' }, user: { id: 'u1' } } as Partial<Request> & { organization?: unknown };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await mw(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    expect(req.organization).toBeDefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('validateOrganizationOwnership allows owner', async (): Promise<void> => {
    mockGetMembership.mockResolvedValue({ role: 'owner' });
    const req = { organization: { _id: 'o1' }, user: { id: 'u1' } } as Partial<Request>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await validateOrganizationOwnership(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });

  it('validateOrganizationOwnership denies non-owner', async (): Promise<void> => {
    mockGetMembership.mockResolvedValue({ role: 'member' });
    const req = { organization: { _id: 'o1' }, user: { id: 'u1' } } as Partial<Request>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await validateOrganizationOwnership(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    const callArg = next.mock.calls[0][0] as unknown as { statusCode?: number } | undefined;
    expect(callArg?.statusCode).toBe(403);
  });

  it('requireActiveOrganization returns 403 when no active org', async (): Promise<void> => {
    mockGetActiveOrganization.mockResolvedValue(null);
    const req = { user: { id: 'u1' } } as Partial<Request>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await requireActiveOrganization(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    const callArg = next.mock.calls[0][0] as unknown as { statusCode?: number } | undefined;
    expect(callArg?.statusCode).toBe(403);
  });

  it('requireActiveOrganization attaches organization when found and active', async (): Promise<void> => {
    mockGetActiveOrganization.mockResolvedValue('o1');
    mockOrgFindById.mockResolvedValue({ _id: 'o1', active: true });
    const req = { user: { id: 'u1' } } as Partial<Request> & { organization?: unknown };
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await requireActiveOrganization(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    expect(req.organization).toBeDefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('validateMinimumRole denies when role too low', async (): Promise<void> => {
    mockGetMembership.mockResolvedValue({ role: 'member' });
    const mw = validateMinimumRole(MembershipRole.ADMIN);
    const req = { organization: { _id: 'o1' }, user: { id: 'u1' } } as Partial<Request>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await mw(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    const callArg = next.mock.calls[0][0] as unknown as { statusCode?: number } | undefined;
    expect(callArg?.statusCode).toBe(403);
  });

  it('validateMinimumRole allows when sufficient role', async (): Promise<void> => {
    mockGetMembership.mockResolvedValue({ role: 'owner' });
    const mw = validateMinimumRole(MembershipRole.ADMIN);
    const req = { organization: { _id: 'o1' }, user: { id: 'u1' } } as Partial<Request>;
    const next = jest.fn() as jest.MockedFunction<(err?: unknown) => void>;
    await mw(req as Request, {} as Partial<Response> as Response, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledWith();
  });
});

import mongoose from 'mongoose';

jest.resetModules();

// Helper types and factories for Mongoose-like query chains used in tests
type QueryChain<T> = {
  sort: jest.Mock<unknown, [Record<string, number>]>,
  skip: jest.Mock<unknown, [number]>,
  limit: jest.Mock<unknown, [number]>,
  lean: jest.Mock<Promise<T[]>, []>
};

const makeQueryChain = <T>(items: T[]): QueryChain<T> => {
  const lean = jest.fn().mockResolvedValue(items);
  const limit = jest.fn().mockReturnValue({ lean });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  return { sort, skip, limit, lean } as unknown as QueryChain<T>;
};

// ---- Mocks (must be defined before requiring the service) ----
jest.mock('../../../src/models/notification.model', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    insertMany: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn()
  }
}));

jest.mock('../../../src/services/membership.service', () => ({
  __esModule: true,
  getActiveOrganization: jest.fn()
}));

jest.mock('../../../src/models/membership.model', () => ({
  __esModule: true,
  default: {
    find: jest.fn()
  },
  MembershipStatus: {
    ACTIVE: 'ACTIVE',
    INVITED: 'INVITED',
    INACTIVE: 'INACTIVE'
  }
}));

jest.mock('../../../src/socket/socket', () => ({
  __esModule: true,
  emitToUser: jest.fn()
}));

type NotificationModelMock = {
  create: jest.MockedFunction<(doc: InsertedNotification) => Promise<InsertedNotification>>;
  insertMany: jest.MockedFunction<(docs: InsertedNotification[]) => Promise<InsertedNotification[]>>;
  find: jest.MockedFunction<(...args: unknown[]) => unknown>;
  countDocuments: jest.MockedFunction<(...args: unknown[]) => Promise<number>>;
  updateOne: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
  updateMany: jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;
};

let NotificationModel: NotificationModelMock;
let getActiveOrganization: jest.MockedFunction<(...args: unknown[]) => Promise<string | null>>;
let Membership: { find: jest.MockedFunction<(...args: unknown[]) => unknown> };
let MembershipStatus: { ACTIVE: string; INVITED: string; INACTIVE: string };
let emitToUser: jest.MockedFunction<(recipient: string, payload: unknown) => unknown>;
let notificationService: typeof import('../../../src/services/notification.service');

beforeEach(async () => {
  jest.resetModules();

  // Import mocked modules after reset so jest.mock() overrides are applied
  NotificationModel = (await import('../../../src/models/notification.model')).default as unknown as NotificationModelMock;

  // getActiveOrganization mock
  const membershipService = await import('../../../src/services/membership.service');
  getActiveOrganization = membershipService.getActiveOrganization as unknown as jest.MockedFunction<(...args: unknown[]) => Promise<string | null>>;

  // Membership mock
  const membershipModel = await import('../../../src/models/membership.model');
  Membership = membershipModel.default as unknown as { find: jest.MockedFunction<(...args: unknown[]) => unknown> };
  MembershipStatus = membershipModel.MembershipStatus as unknown as { ACTIVE: string; INVITED: string; INACTIVE: string };

  emitToUser = (await import('../../../src/socket/socket')).emitToUser as unknown as jest.MockedFunction<(recipient: string, payload: unknown) => unknown>;

  notificationService = await import('../../../src/services/notification.service');
});

type EntityKind = 'document' | 'membership';

type MembershipRecipient = { user?: mongoose.Types.ObjectId | null };

type InsertedNotification = {
  _id?: mongoose.Types.ObjectId;
  organization: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  actor: mongoose.Types.ObjectId;
  type: string;
  entity: { kind: EntityKind; id: mongoose.Types.ObjectId };
  message: string;
  metadata: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

describe('notification.service (unit)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const oid = (): string => new mongoose.Types.ObjectId().toString();

  // IMPORTANT: allow _id to be truly undefined (for optional chaining test)
  const makeInsertedNotification = (
    overrides: Partial<InsertedNotification> & {
      entity?: Partial<InsertedNotification['entity']>;
    } = {}
  ): InsertedNotification => {
    const hasId = Object.prototype.hasOwnProperty.call(overrides, '_id');

    const _id = hasId ? overrides._id : new mongoose.Types.ObjectId();
    const organization = overrides.organization ?? new mongoose.Types.ObjectId();
    const recipient = overrides.recipient ?? new mongoose.Types.ObjectId();
    const actor = overrides.actor ?? new mongoose.Types.ObjectId();

    const baseEntityId =
      (overrides.entity?.id ?? overrides.entity?.id === undefined)
        ? overrides?.entity?.id
        : new mongoose.Types.ObjectId();

    const entityKind = (overrides.entity?.kind ?? 'document') as EntityKind;
    const entityId = baseEntityId ?? new mongoose.Types.ObjectId();

    return {
      _id,
      organization,
      recipient,
      actor,
      type: overrides.type ?? 'DOC_COMMENTED',
      entity: overrides.entity
        ? { kind: entityKind, id: entityId }
        : { kind: 'document', id: entityId },
      message: overrides.message ?? '',
      metadata: overrides.metadata ?? {},
      readAt: overrides.readAt ?? null,
      createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z')
    };
  };

  describe('createNotificationForUser', (): void => {
    it('throws 400 for invalid ids (organizationId, recipientUserId, actorUserId, entityId)', async () => {
      await expect(
        notificationService.createNotificationForUser({
          organizationId: 'bad',
          recipientUserId: oid(),
          actorUserId: oid(),
          type: 'DOC_COMMENTED',
          entityKind: 'document',
          entityId: oid()
        })
      ).rejects.toThrow('Invalid organization ID');

      await expect(
        notificationService.createNotificationForUser({
          organizationId: oid(),
          recipientUserId: 'bad',
          actorUserId: oid(),
          type: 'DOC_COMMENTED',
          entityKind: 'document',
          entityId: oid()
        })
      ).rejects.toThrow('Invalid recipient user ID');

      await expect(
        notificationService.createNotificationForUser({
          organizationId: oid(),
          recipientUserId: oid(),
          actorUserId: 'bad',
          type: 'DOC_COMMENTED',
          entityKind: 'document',
          entityId: oid()
        })
      ).rejects.toThrow('Invalid actor user ID');

      await expect(
        notificationService.createNotificationForUser({
          organizationId: oid(),
          recipientUserId: oid(),
          actorUserId: oid(),
          type: 'DOC_COMMENTED',
          entityKind: 'document',
          entityId: 'bad'
        })
      ).rejects.toThrow('Invalid entity ID');
    });

    it('persists notification and uses provided emitter (does not call default emitToUser)', async () => {
      const organizationId = oid();
      const recipientUserId = oid();
      const actorUserId = oid();
      const entityId = oid();

      const created = makeInsertedNotification({
        _id: new mongoose.Types.ObjectId(),
        organization: new mongoose.Types.ObjectId(organizationId),
        recipient: new mongoose.Types.ObjectId(recipientUserId),
        actor: new mongoose.Types.ObjectId(actorUserId),
        type: 'DOC_COMMENTED',
        entity: { kind: 'document', id: new mongoose.Types.ObjectId(entityId) },
        message: 'hi',
        metadata: { a: 1 },
        readAt: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z')
      });

      NotificationModel.create.mockResolvedValue(created);

      const emitter = jest.fn();

      const res = await notificationService.createNotificationForUser({
        organizationId,
        recipientUserId,
        actorUserId,
        type: 'DOC_COMMENTED',
        entityKind: 'document',
        entityId,
        message: 'hi',
        metadata: { a: 1 },
        emitter
      });

      expect(NotificationModel.create).toHaveBeenCalledTimes(1);

      const createArg = NotificationModel.create.mock.calls[0][0] as unknown as InsertedNotification;
      expect(createArg.organization.toString()).toBe(
        new mongoose.Types.ObjectId(organizationId).toString()
      );
      expect(createArg.recipient.toString()).toBe(
        new mongoose.Types.ObjectId(recipientUserId).toString()
      );
      expect(createArg.actor.toString()).toBe(new mongoose.Types.ObjectId(actorUserId).toString());
      expect(createArg.type).toBe('DOC_COMMENTED');
      expect(createArg.entity.kind).toBe('document');
      expect(createArg.entity.id.toString()).toBe(new mongoose.Types.ObjectId(entityId).toString());
      expect(createArg.message).toBe('hi');
      expect(createArg.metadata).toEqual({ a: 1 });
      expect(createArg.readAt).toBeNull();
      expect(createArg.createdAt).toBeInstanceOf(Date);
      expect(createArg.updatedAt).toBeInstanceOf(Date);

      expect(emitter).toHaveBeenCalledTimes(1);
      const [recipientId, payload] = emitter.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(recipientId).toBe(recipientUserId);

      expect(payload.organization).toBe(organizationId);
      expect(payload.recipient).toBe(recipientUserId);
      expect(payload.actor).toBe(actorUserId);
      expect(payload.type).toBe('DOC_COMMENTED');
      expect(payload.entity).toEqual({ kind: 'document', id: entityId });
      expect(payload.message).toBe('hi');
      expect(payload.metadata).toEqual({ a: 1 });
      expect(payload.readAt).toBeNull();
      expect(payload.createdAt).toEqual(created.createdAt);

      expect(emitToUser).not.toHaveBeenCalled();
      expect(res).toBe(created);
    });

    it('uses defaultEmitter when emitter not provided and swallows emitToUser errors', async (): Promise<void> => {
      const organizationId = oid();
      const recipientUserId = oid();
      const actorUserId = oid();
      const entityId = oid();

      const created = makeInsertedNotification({
        organization: new mongoose.Types.ObjectId(organizationId),
        recipient: new mongoose.Types.ObjectId(recipientUserId),
        actor: new mongoose.Types.ObjectId(actorUserId),
        entity: { kind: 'document', id: new mongoose.Types.ObjectId(entityId) }
      });

      NotificationModel.create.mockResolvedValue(created);

      emitToUser.mockImplementation(() => {
        throw new Error('socket down');
      });

      const res = await notificationService.createNotificationForUser({
        organizationId,
        recipientUserId,
        actorUserId,
        type: 'DOC_COMMENTED',
        entityKind: 'document',
        entityId
      });

      expect(NotificationModel.create).toHaveBeenCalledTimes(1);
      expect(emitToUser).toHaveBeenCalledTimes(1);
      expect(res).toBe(created);
    });

    it('emits payload id as undefined if _id missing (covers optional chaining)', async () => {
      const organizationId = oid();
      const recipientUserId = oid();
      const actorUserId = oid();
      const entityId = oid();

      const created = makeInsertedNotification({
        _id: undefined,
        organization: new mongoose.Types.ObjectId(organizationId),
        recipient: new mongoose.Types.ObjectId(recipientUserId),
        actor: new mongoose.Types.ObjectId(actorUserId),
        entity: { kind: 'document', id: new mongoose.Types.ObjectId(entityId) }
      });

      NotificationModel.create.mockResolvedValue(created);

      const emitter = jest.fn();

      await notificationService.createNotificationForUser({
        organizationId,
        recipientUserId,
        actorUserId,
        type: 'DOC_COMMENTED',
        entityKind: 'document',
        entityId,
        emitter
      });

      expect(emitter).toHaveBeenCalledTimes(1);
      const call = emitter.mock.calls[0] as unknown as [string, Record<string, unknown>];
      const payload = call[1];
      expect(payload.id).toBeUndefined();
    });
  });

  describe('notifyMembersOfOrganization', (): void => {
    it('throws 400 for invalid ids (organizationId, actorUserId, entityId)', async () => {
      await expect(
        notificationService.notifyMembersOfOrganization({
          organizationId: 'bad',
          actorUserId: oid(),
          type: 'DOC_COMMENTED',
          entityKind: 'document',
          entityId: oid()
        })
      ).rejects.toThrow('Invalid organization ID');

      await expect(
        notificationService.notifyMembersOfOrganization({
          organizationId: oid(),
          actorUserId: 'bad',
          type: 'DOC_COMMENTED',
          entityKind: 'document',
          entityId: oid()
        })
      ).rejects.toThrow('Invalid actor user ID');

      await expect(
        notificationService.notifyMembersOfOrganization({
          organizationId: oid(),
          actorUserId: oid(),
          type: 'DOC_COMMENTED',
          entityKind: 'document',
          entityId: 'bad'
        })
      ).rejects.toThrow('Invalid entity ID');
    });

    it('returns [] when there are no recipients (no active memberships excluding actor)', async () => {
      Membership.find.mockReturnValue(makeQueryChain<unknown>([]));

      const res = await notificationService.notifyMembersOfOrganization({
        organizationId: oid(),
        actorUserId: oid(),
        type: 'DOC_COMMENTED',
        entityKind: 'document',
        entityId: oid()
      });

      expect(res).toEqual([]);
      expect(NotificationModel.insertMany).not.toHaveBeenCalled();
      expect(getActiveOrganization).not.toHaveBeenCalled();
    });

    it('persists notifications and uses provided emitter (does not call default emitToUser)', async () => {
      const organizationId = oid();
      const actorUserId = oid();
      const entityId = oid();

      const recipient1 = new mongoose.Types.ObjectId();
      const recipient2 = new mongoose.Types.ObjectId();

      Membership.find.mockReturnValue(makeQueryChain<Partial<MembershipRecipient>>([{ user: recipient1 }, { user: recipient2 }]));

      const inserted = [
        makeInsertedNotification({
          organization: new mongoose.Types.ObjectId(organizationId),
          recipient: recipient1,
          actor: new mongoose.Types.ObjectId(actorUserId),
          entity: { kind: 'document', id: new mongoose.Types.ObjectId(entityId) },
          message: 'hello',
          metadata: { a: 1 }
        }),
        makeInsertedNotification({
          organization: new mongoose.Types.ObjectId(organizationId),
          recipient: recipient2,
          actor: new mongoose.Types.ObjectId(actorUserId),
          entity: { kind: 'document', id: new mongoose.Types.ObjectId(entityId) },
          message: 'hello',
          metadata: { a: 1 }
        })
      ];

      NotificationModel.insertMany.mockResolvedValue(inserted);

      const emitter = jest.fn();

      const res = await notificationService.notifyMembersOfOrganization({
        organizationId,
        actorUserId,
        type: 'DOC_COMMENTED',
        entityKind: 'document',
        entityId,
        message: 'hello',
        metadata: { a: 1 },
        emitter
      });

      const [filterRaw, projection] = Membership.find.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
      const filter = filterRaw as unknown as {
        organization: mongoose.Types.ObjectId;
        user: { $ne: mongoose.Types.ObjectId };
        status: string;
      };

      expect(filter.organization.toString()).toBe(new mongoose.Types.ObjectId(organizationId).toString());
      expect(filter.user.$ne.toString()).toBe(new mongoose.Types.ObjectId(actorUserId).toString());
      expect(filter.status).toBe(MembershipStatus.ACTIVE);
      expect(projection).toEqual({ user: 1 });

      expect(NotificationModel.insertMany).toHaveBeenCalledTimes(1);
      const [docsToInsert, options] = NotificationModel.insertMany.mock.calls[0] as unknown as [InsertedNotification[], unknown];
      expect(options).toEqual({ ordered: false });
      expect(docsToInsert).toHaveLength(2);
      expect(docsToInsert[0].message).toBe('hello');
      expect(docsToInsert[0].metadata).toEqual({ a: 1 });

      expect(emitter).toHaveBeenCalledTimes(2);

      const [firstRecipientId, firstPayload] = emitter.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(firstRecipientId).toBe(recipient1.toString());
      expect(firstPayload.organization).toBe(organizationId);
      expect(firstPayload.recipient).toBe(recipient1.toString());
      expect(firstPayload.actor).toBe(actorUserId);
      expect(firstPayload.type).toBe('DOC_COMMENTED');
      expect(firstPayload.entity).toEqual({ kind: 'document', id: entityId });
      expect(firstPayload.message).toBe('hello');
      expect(firstPayload.metadata).toEqual({ a: 1 });
      expect(firstPayload.readAt).toBeNull();

      expect(emitToUser).not.toHaveBeenCalled();
      expect(getActiveOrganization).not.toHaveBeenCalled();
      expect(res).toBe(inserted);
    });

    it('uses defaultEmitter when emitter not provided and swallows emitToUser errors', async (): Promise<void> => {
      const organizationId = oid();
      const actorUserId = oid();
      const entityId = oid();

      const recipient1 = new mongoose.Types.ObjectId();

      Membership.find.mockReturnValue(makeQueryChain<Partial<MembershipRecipient>>([{ user: recipient1 }]));

      const inserted = [
        makeInsertedNotification({
          organization: new mongoose.Types.ObjectId(organizationId),
          recipient: recipient1,
          actor: new mongoose.Types.ObjectId(actorUserId),
          entity: { kind: 'document', id: new mongoose.Types.ObjectId(entityId) }
        })
      ];

      NotificationModel.insertMany.mockResolvedValue(inserted);

      emitToUser.mockImplementation(() => {
        throw new Error('socket down');
      });

      const res = await notificationService.notifyMembersOfOrganization({
        organizationId,
        actorUserId,
        type: 'DOC_COMMENTED',
        entityKind: 'document',
        entityId
      });

      expect(NotificationModel.insertMany).toHaveBeenCalledTimes(1);
      const [docsToInsert] = NotificationModel.insertMany.mock.calls[0] as unknown as [InsertedNotification[], unknown];
      expect(docsToInsert[0].message).toBe('');
      expect(docsToInsert[0].metadata).toEqual({});

      expect(res).toBe(inserted);
      expect(emitToUser).toHaveBeenCalledTimes(1);
      expect(getActiveOrganization).not.toHaveBeenCalled();
    });

    it('filters out falsy membership user ids and returns [] if all are invalid', async (): Promise<void> => {
      Membership.find.mockReturnValue(makeQueryChain<Partial<MembershipRecipient>>([{ user: null }, {}, { user: undefined }]));

      const res = await notificationService.notifyMembersOfOrganization({
        organizationId: oid(),
        actorUserId: oid(),
        type: 'DOC_COMMENTED',
        entityKind: 'document',
        entityId: oid()
      });

      expect(res).toEqual([]);
      expect(NotificationModel.insertMany).not.toHaveBeenCalled();
      expect(getActiveOrganization).not.toHaveBeenCalled();
    });

    it('emits payload id as undefined if _id missing (covers optional chaining)', async () => {
      const organizationId = oid();
      const actorUserId = oid();
      const entityId = oid();

      const recipient1 = new mongoose.Types.ObjectId();

      Membership.find.mockReturnValue(makeQueryChain<Partial<MembershipRecipient>>([{ user: recipient1 }]));

      const inserted = [
        makeInsertedNotification({
          _id: undefined,
          organization: new mongoose.Types.ObjectId(organizationId),
          recipient: recipient1,
          actor: new mongoose.Types.ObjectId(actorUserId),
          entity: { kind: 'document', id: new mongoose.Types.ObjectId(entityId) }
        })
      ];

      NotificationModel.insertMany.mockResolvedValue(inserted);

      const emitter = jest.fn();

      await notificationService.notifyMembersOfOrganization({
        organizationId,
        actorUserId,
        type: 'DOC_COMMENTED',
        entityKind: 'document',
        entityId,
        emitter
      });

      expect(emitter).toHaveBeenCalledTimes(1);
      const call = emitter.mock.calls[0] as unknown as [string, Record<string, unknown>];
      const payload = call[1];
      expect(payload.id).toBeUndefined();
    });
  });

  describe('notifyOrganizationMembers', (): void => {
    it('throws 400 for invalid actorUserId', async (): Promise<void> => {
      await expect(
        notificationService.notifyOrganizationMembers({
          actorUserId: 'bad',
          type: 'DOC_COMMENTED',
          documentId: oid()
        })
      ).rejects.toThrow('Invalid actor user ID');
    });

    it('throws 400 for invalid entityId when using entityKind+entityId', async (): Promise<void> => {
      await expect(
        notificationService.notifyOrganizationMembers({
          actorUserId: oid(),
          type: 'DOC_COMMENTED',
          entityKind: 'membership',
          entityId: 'bad'
        })
      ).rejects.toThrow('Invalid entity ID');
    });

    it('throws 400 when missing entityId (or documentId) for notification', async () => {
      await expect(
        notificationService.notifyOrganizationMembers({
          actorUserId: oid(),
          type: 'DOC_COMMENTED'
        })
      ).rejects.toThrow('Missing entityId (or documentId) for notification');
    });

    it('throws 403 when no active organization', async (): Promise<void> => {
      getActiveOrganization.mockResolvedValue(null);

      await expect(
        notificationService.notifyOrganizationMembers({
          actorUserId: oid(),
          type: 'DOC_COMMENTED',
          documentId: oid()
        })
      ).rejects.toThrow('No active organization. Please create or join an organization first.');
    });

    it('returns [] when there are no recipients (no active memberships excluding actor)', async () => {
      getActiveOrganization.mockResolvedValue(oid());

      Membership.find.mockReturnValue(makeQueryChain<Partial<MembershipRecipient>>([]));

      const res = await notificationService.notifyOrganizationMembers({
        actorUserId: oid(),
        type: 'DOC_COMMENTED',
        documentId: oid()
      });

      expect(res).toEqual([]);
      expect(NotificationModel.insertMany).not.toHaveBeenCalled();
    });

    it('persists notifications and uses provided emitter (does not call default emitToUser)', async () => {
      const actorUserId = oid();
      const documentId = oid();
      const activeOrgId = oid();

      getActiveOrganization.mockResolvedValue(activeOrgId);

      const recipient1 = new mongoose.Types.ObjectId();
      const recipient2 = new mongoose.Types.ObjectId();

      Membership.find.mockReturnValue(makeQueryChain<Partial<MembershipRecipient>>([{ user: recipient1 }, { user: recipient2 }]));

      const inserted = [
        makeInsertedNotification({
          organization: new mongoose.Types.ObjectId(activeOrgId),
          recipient: recipient1,
          actor: new mongoose.Types.ObjectId(actorUserId),
          entity: { kind: 'document', id: new mongoose.Types.ObjectId(documentId) },
          message: 'hello',
          metadata: { a: 1 }
        }),
        makeInsertedNotification({
          organization: new mongoose.Types.ObjectId(activeOrgId),
          recipient: recipient2,
          actor: new mongoose.Types.ObjectId(actorUserId),
          entity: { kind: 'document', id: new mongoose.Types.ObjectId(documentId) },
          message: 'hello',
          metadata: { a: 1 }
        })
      ];

      NotificationModel.insertMany.mockResolvedValue(inserted);

      const emitter = jest.fn();

      const res = await notificationService.notifyOrganizationMembers({
        actorUserId,
        type: 'DOC_COMMENTED',
        documentId,
        message: 'hello',
        metadata: { a: 1 },
        emitter
      });

      const [filterRaw, projection] = Membership.find.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
      const filter = filterRaw as unknown as {
        organization: mongoose.Types.ObjectId;
        user: { $ne: mongoose.Types.ObjectId };
        status: string;
      };

      expect(filter.organization.toString()).toBe(new mongoose.Types.ObjectId(activeOrgId).toString());
      expect(filter.user.$ne.toString()).toBe(new mongoose.Types.ObjectId(actorUserId).toString());
      expect(filter.status).toBe(MembershipStatus.ACTIVE);
      expect(projection).toEqual({ user: 1 });

      expect(NotificationModel.insertMany).toHaveBeenCalledTimes(1);
      const [docsToInsert, options] = NotificationModel.insertMany.mock.calls[0] as unknown as [InsertedNotification[], unknown];
      expect(options).toEqual({ ordered: false });
      expect(docsToInsert).toHaveLength(2);
      expect(docsToInsert[0].message).toBe('hello');
      expect(docsToInsert[0].metadata).toEqual({ a: 1 });

      expect(emitter).toHaveBeenCalledTimes(2);

      const [recipientId, payload] = emitter.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(recipientId).toBe(recipient1.toString());

      expect(payload.organization).toBe(activeOrgId);
      expect(payload.recipient).toBe(recipient1.toString());
      expect(payload.actor).toBe(actorUserId);
      expect(payload.type).toBe('DOC_COMMENTED');
      expect(payload.entity).toEqual({ kind: 'document', id: documentId });
      expect(payload.message).toBe('hello');
      expect(payload.metadata).toEqual({ a: 1 });
      expect(payload.readAt).toBeNull();

      expect(emitToUser).not.toHaveBeenCalled();
      expect(res).toBe(inserted);
    });

    it('uses defaultEmitter when emitter not provided and swallows emitToUser errors', async (): Promise<void> => {
      const actorUserId = oid();
      const documentId = oid();
      const activeOrgId = oid();

      getActiveOrganization.mockResolvedValue(activeOrgId);

      const recipient1 = new mongoose.Types.ObjectId();

      Membership.find.mockReturnValue(makeQueryChain<Partial<MembershipRecipient>>([{ user: recipient1 }]));

      const inserted = [
        makeInsertedNotification({
          organization: new mongoose.Types.ObjectId(activeOrgId),
          recipient: recipient1,
          actor: new mongoose.Types.ObjectId(actorUserId),
          entity: { kind: 'document', id: new mongoose.Types.ObjectId(documentId) }
        })
      ];

      NotificationModel.insertMany.mockResolvedValue(inserted);

      emitToUser.mockImplementation(() => {
        throw new Error('socket down');
      });

      const res = await notificationService.notifyOrganizationMembers({
        actorUserId,
        type: 'DOC_COMMENTED',
        documentId
      });

      expect(NotificationModel.insertMany).toHaveBeenCalledTimes(1);
      const [docsToInsert] = NotificationModel.insertMany.mock.calls[0] as unknown as [InsertedNotification[], unknown];
      expect(docsToInsert[0].message).toBe('');
      expect(docsToInsert[0].metadata).toEqual({});

      expect(res).toBe(inserted);
      expect(emitToUser).toHaveBeenCalledTimes(1);
    });

    it('filters out falsy membership user ids and returns [] if all are invalid', async (): Promise<void> => {
      getActiveOrganization.mockResolvedValue(oid());

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: null }, {}, { user: undefined }])
      } as unknown);

      const res = await notificationService.notifyOrganizationMembers({
        actorUserId: oid(),
        type: 'DOC_COMMENTED',
        documentId: oid()
      });

      expect(res).toEqual([]);
      expect(NotificationModel.insertMany).not.toHaveBeenCalled();
    });

    it('emits payload id as undefined if _id missing (covers optional chaining)', async () => {
      const actorUserId = oid();
      const documentId = oid();
      const activeOrgId = oid();

      getActiveOrganization.mockResolvedValue(activeOrgId);
      const recipient1 = new mongoose.Types.ObjectId();

      Membership.find.mockReturnValue(makeQueryChain<Partial<MembershipRecipient>>([{ user: recipient1 }]));

      const inserted = [
        makeInsertedNotification({
          _id: undefined,
          organization: new mongoose.Types.ObjectId(activeOrgId),
          recipient: recipient1,
          actor: new mongoose.Types.ObjectId(actorUserId),
          entity: { kind: 'document', id: new mongoose.Types.ObjectId(documentId) }
        })
      ];

      NotificationModel.insertMany.mockResolvedValue(inserted);

      const emitter = jest.fn();

      await notificationService.notifyOrganizationMembers({
        actorUserId,
        type: 'DOC_COMMENTED',
        documentId,
        emitter
      });

      expect(emitter).toHaveBeenCalledTimes(1);
      const call = emitter.mock.calls[0] as unknown as [string, Record<string, unknown>];
      const payload = call[1];
      expect(payload.id).toBeUndefined();
    });

    it('uses entityKind+entityId when provided (does not require documentId)', async () => {
      const actorUserId = oid();
      const entityId = oid();
      const activeOrgId = oid();

      getActiveOrganization.mockResolvedValue(activeOrgId);

      const recipient1 = new mongoose.Types.ObjectId();

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: recipient1 }])
      } as unknown);

      const inserted = [
        makeInsertedNotification({
          organization: new mongoose.Types.ObjectId(activeOrgId),
          recipient: recipient1,
          actor: new mongoose.Types.ObjectId(actorUserId),
          entity: { kind: 'membership', id: new mongoose.Types.ObjectId(entityId) }
        })
      ];

      NotificationModel.insertMany.mockResolvedValue(inserted);

      await notificationService.notifyOrganizationMembers({
        actorUserId,
        type: 'INVITATION_CREATED',
        entityKind: 'membership',
        entityId
      });

      expect(NotificationModel.insertMany).toHaveBeenCalledTimes(1);
      const [docsToInsert] = NotificationModel.insertMany.mock.calls[0] as unknown as [InsertedNotification[], unknown];
      expect(docsToInsert[0].entity.kind).toBe('membership');
      expect(docsToInsert[0].entity.id.toString()).toBe(
        new mongoose.Types.ObjectId(entityId).toString()
      );
    });
  });

  describe('listNotifications', (): void => {
    it('throws 400 for invalid userId', async (): Promise<void> => {
      await expect(notificationService.listNotifications({ userId: 'bad' })).rejects.toThrow(
        'Invalid user ID'
      );
    });

    it('uses provided organizationId when valid (org notifications OR INVITATION_CREATED)', async () => {
      const userId = oid();
      const orgId = oid();

      const qc = makeQueryChain([{ id: 1 }]);
      NotificationModel.find.mockReturnValue(qc as unknown);
      const { sort, skip, limit } = qc;
      NotificationModel.countDocuments.mockResolvedValue(99);

      const res = await notificationService.listNotifications({
        userId,
        organizationId: orgId,
        unreadOnly: false,
        limit: 10,
        skip: 5
      });

      expect(getActiveOrganization).not.toHaveBeenCalled();

      const queryRaw = NotificationModel.find.mock.calls[0][0] as unknown as Record<string, unknown>;
      const queryArg = queryRaw as unknown as {
        recipient: mongoose.Types.ObjectId;
        readAt?: unknown;
        $or?: Array<{ organization: mongoose.Types.ObjectId } | { type: string }>;
      };

      expect(queryArg.recipient.toString()).toBe(new mongoose.Types.ObjectId(userId).toString());
      expect(queryArg.readAt).toBeUndefined();

      expect(queryArg.$or).toHaveLength(2);
      expect((queryArg.$or![0] as { organization: mongoose.Types.ObjectId }).organization.toString()).toBe(new mongoose.Types.ObjectId(orgId).toString());
      expect(queryArg.$or![1]).toEqual({ type: 'INVITATION_CREATED' });

      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(skip).toHaveBeenCalledWith(5);
      expect(limit).toHaveBeenCalledWith(10);
      expect(NotificationModel.countDocuments).toHaveBeenCalledWith(queryArg);

      expect(res).toEqual({ notifications: [{ id: 1 }], total: 99 });
    });

    it('falls back to active organization when organizationId not provided (org notifications OR INVITATION_CREATED)', async () => {
      const userId = oid();
      const activeOrgId = oid();
      getActiveOrganization.mockResolvedValue(activeOrgId);

      const qc = makeQueryChain<unknown>([]);
      NotificationModel.find.mockReturnValue(qc as unknown);
      NotificationModel.countDocuments.mockResolvedValue(0);

      const res = await notificationService.listNotifications({ userId });

      expect(getActiveOrganization).toHaveBeenCalledWith(userId);

      const queryRaw = NotificationModel.find.mock.calls[0][0] as unknown as Record<string, unknown>;
      const queryArg = queryRaw as unknown as {
        $or?: Array<{ organization: mongoose.Types.ObjectId } | { type: string }>;
      };
      expect(queryArg.$or).toHaveLength(2);
      expect((queryArg.$or![0] as { organization: mongoose.Types.ObjectId }).organization.toString()).toBe(new mongoose.Types.ObjectId(activeOrgId).toString());
      expect(queryArg.$or![1]).toEqual({ type: 'INVITATION_CREATED' });

      expect(res).toEqual({ notifications: [], total: 0 });
    });

    it('when no org context (active org missing): returns only INVITATION_CREATED (does not throw)', async () => {
      const userId = oid();
      getActiveOrganization.mockResolvedValue(null);

      const qc = makeQueryChain([{ id: 'inv' }]);
      NotificationModel.find.mockReturnValue(qc as unknown);
      NotificationModel.countDocuments.mockResolvedValue(1);

      await expect(notificationService.listNotifications({ userId })).rejects.toThrow(
        'No active organization. Please create or join an organization first.'
      );
    });

    it('when organizationId provided but invalid: treats as no org context and returns only INVITATION_CREATED', async (): Promise<void> => {
      const userId = oid();

      const qc = makeQueryChain<unknown>([]);
      NotificationModel.find.mockReturnValue(qc as unknown);
      NotificationModel.countDocuments.mockResolvedValue(0);

      await expect(
        notificationService.listNotifications({ userId, organizationId: 'bad' })
      ).rejects.toThrow('No active organization. Please create or join an organization first.');
    });

    it('adds readAt=null filter when unreadOnly is true', async (): Promise<void> => {
      const userId = oid();
      const orgId = oid();

      const qc = makeQueryChain<unknown>([]);
      NotificationModel.find.mockReturnValue(qc as unknown);
      NotificationModel.countDocuments.mockResolvedValue(0);

      await notificationService.listNotifications({
        userId,
        organizationId: orgId,
        unreadOnly: true
      });

      const queryRaw = NotificationModel.find.mock.calls[0][0] as unknown as Record<string, unknown>;
      const queryArg = queryRaw as unknown as { readAt?: unknown; $or?: unknown };
      expect(queryArg.readAt).toBeNull();
      expect(queryArg.$or).toBeDefined();
    });
  });

  describe('markNotificationRead', (): void => {
    it('throws 400 for invalid userId or notificationId', async (): Promise<void> => {
      await expect(notificationService.markNotificationRead('bad', oid())).rejects.toThrow(
        'Invalid user ID'
      );

      await expect(notificationService.markNotificationRead(oid(), 'bad')).rejects.toThrow(
        'Invalid notification ID'
      );
    });

    it('throws 404 when updateOne matchedCount is 0', async (): Promise<void> => {
      NotificationModel.updateOne.mockResolvedValue({ matchedCount: 0 });

      await expect(notificationService.markNotificationRead(oid(), oid())).rejects.toThrow(
        'Notification not found'
      );
    });

    it('updates readAt when notification exists', async (): Promise<void> => {
      const userId = oid();
      const notificationId = oid();
      NotificationModel.updateOne.mockResolvedValue({ matchedCount: 1 });

      await notificationService.markNotificationRead(userId, notificationId);

      expect(NotificationModel.updateOne).toHaveBeenCalledTimes(1);

      const [filter, update] = NotificationModel.updateOne.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];

      expect((filter._id as unknown as mongoose.Types.ObjectId).toString()).toBe(new mongoose.Types.ObjectId(notificationId).toString());
      expect((filter.recipient as unknown as mongoose.Types.ObjectId).toString()).toBe(new mongoose.Types.ObjectId(userId).toString());

      const updateArg = update as unknown as { $set: { readAt: unknown } };
      expect(updateArg).toHaveProperty('$set.readAt');
      expect(updateArg.$set.readAt).toBeInstanceOf(Date);
    });
  });

  describe('markAllRead', (): void => {
    it('throws 400 for invalid userId', async (): Promise<void> => {
      await expect(notificationService.markAllRead('bad')).rejects.toThrow('Invalid user ID');
    });

    it('with org context (provided): marks read for (org notifications) OR (INVITATION_CREATED)', async () => {
      const userId = oid();
      const orgId = oid();

      NotificationModel.updateMany.mockResolvedValue({ acknowledged: true });

      await notificationService.markAllRead(userId, orgId);

      expect(getActiveOrganization).not.toHaveBeenCalled();

      const [filter, update] = NotificationModel.updateMany.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
      const filterArg = filter as unknown as {
        recipient: mongoose.Types.ObjectId;
        readAt?: unknown;
        $or?: Array<{ organization: mongoose.Types.ObjectId } | { type: string }>;
      };
      const updateArg = update as unknown as { $set: { readAt: unknown } };

      expect(filterArg.recipient.toString()).toBe(new mongoose.Types.ObjectId(userId).toString());
      expect(filterArg.readAt).toBeNull();

      expect(filterArg.$or).toHaveLength(2);
      expect((filterArg.$or![0] as { organization: mongoose.Types.ObjectId }).organization.toString()).toBe(new mongoose.Types.ObjectId(orgId).toString());
      expect(filterArg.$or![1]).toEqual({ type: 'INVITATION_CREATED' });

      expect(updateArg.$set.readAt).toBeInstanceOf(Date);
    });

    it('falls back to active organization when organizationId not provided (org notifications OR INVITATION_CREATED)', async () => {
      const userId = oid();
      const orgId = oid();

      getActiveOrganization.mockResolvedValue(orgId);
      NotificationModel.updateMany.mockResolvedValue({ acknowledged: true });

      await notificationService.markAllRead(userId);

      expect(getActiveOrganization).toHaveBeenCalledWith(userId);

      const [filter, update] = NotificationModel.updateMany.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
      const filterArg = filter as unknown as {
        recipient: mongoose.Types.ObjectId;
        readAt?: unknown;
        $or?: Array<{ organization: mongoose.Types.ObjectId } | { type: string }>;
      };
      const updateArg = update as unknown as { $set: { readAt: unknown } };

      expect(filterArg.recipient.toString()).toBe(new mongoose.Types.ObjectId(userId).toString());
      expect(filterArg.readAt).toBeNull();
      expect(filterArg.$or).toHaveLength(2);
      expect((filterArg.$or![0] as { organization: mongoose.Types.ObjectId }).organization.toString()).toBe(new mongoose.Types.ObjectId(orgId).toString());
      expect(filterArg.$or![1]).toEqual({ type: 'INVITATION_CREATED' });

      expect(updateArg.$set.readAt).toBeInstanceOf(Date);
    });

    it('when no org context: marks read only for INVITATION_CREATED (does not throw)', async () => {
      const userId = oid();
      getActiveOrganization.mockResolvedValue(null);

      NotificationModel.updateMany.mockResolvedValue({ acknowledged: true });

      await notificationService.markAllRead(userId);

      expect(getActiveOrganization).toHaveBeenCalledWith(userId);

      const [filter] = NotificationModel.updateMany.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
      const filterArg = filter as unknown as { recipient: mongoose.Types.ObjectId; readAt?: unknown; type?: string; $or?: unknown };

      expect(filterArg.recipient.toString()).toBe(new mongoose.Types.ObjectId(userId).toString());
      expect(filterArg.readAt).toBeNull();
      expect(filterArg.type).toBe('INVITATION_CREATED');
      expect(filterArg.$or).toBeUndefined();
    });

    it('when organizationId provided but invalid: treats as no org context and marks only INVITATION_CREATED', async (): Promise<void> => {
      const userId = oid();

      NotificationModel.updateMany.mockResolvedValue({ acknowledged: true });

      await notificationService.markAllRead(userId, 'bad');

      const [filter] = NotificationModel.updateMany.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
      const filterArg = filter as unknown as { type?: string; $or?: unknown };
      expect(filterArg.type).toBe('INVITATION_CREATED');
      expect(filterArg.$or).toBeUndefined();
    });
  });
});
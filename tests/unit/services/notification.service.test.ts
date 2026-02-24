import mongoose from 'mongoose';

jest.resetModules();

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

const NotificationModel = require('../../../src/models/notification.model').default;
const { getActiveOrganization } = require('../../../src/services/membership.service');
const Membership = require('../../../src/models/membership.model').default;
const { MembershipStatus } = require('../../../src/models/membership.model');
const { emitToUser } = require('../../../src/socket/socket');

const notificationService = require('../../../src/services/notification.service');

type EntityKind = 'document' | 'membership';

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

  const oid = () => new mongoose.Types.ObjectId().toString();

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

  describe('createNotificationForUser', () => {
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

      const createArg = NotificationModel.create.mock.calls[0][0];
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
      const [recipientId, payload] = emitter.mock.calls[0];
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

    it('uses defaultEmitter when emitter not provided and swallows emitToUser errors', async () => {
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
      const payload = emitter.mock.calls[0][1];
      expect(payload.id).toBeUndefined();
    });
  });

  describe('notifyMembersOfOrganization', () => {
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
      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

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

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: recipient1 }, { user: recipient2 }])
      });

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

      const [filter, projection] = Membership.find.mock.calls[0];

      expect(filter.organization.toString()).toBe(
        new mongoose.Types.ObjectId(organizationId).toString()
      );
      expect(filter.user.$ne.toString()).toBe(new mongoose.Types.ObjectId(actorUserId).toString());
      expect(filter.status).toBe(MembershipStatus.ACTIVE);
      expect(projection).toEqual({ user: 1 });

      expect(NotificationModel.insertMany).toHaveBeenCalledTimes(1);
      const [docsToInsert, options] = NotificationModel.insertMany.mock.calls[0];
      expect(options).toEqual({ ordered: false });
      expect(docsToInsert).toHaveLength(2);
      expect(docsToInsert[0].message).toBe('hello');
      expect(docsToInsert[0].metadata).toEqual({ a: 1 });

      expect(emitter).toHaveBeenCalledTimes(2);

      const [firstRecipientId, firstPayload] = emitter.mock.calls[0];
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

    it('uses defaultEmitter when emitter not provided and swallows emitToUser errors', async () => {
      const organizationId = oid();
      const actorUserId = oid();
      const entityId = oid();

      const recipient1 = new mongoose.Types.ObjectId();

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: recipient1 }])
      });

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
      const [docsToInsert] = NotificationModel.insertMany.mock.calls[0];
      expect(docsToInsert[0].message).toBe('');
      expect(docsToInsert[0].metadata).toEqual({});

      expect(res).toBe(inserted);
      expect(emitToUser).toHaveBeenCalledTimes(1);
      expect(getActiveOrganization).not.toHaveBeenCalled();
    });

    it('filters out falsy membership user ids and returns [] if all are invalid', async () => {
      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: null }, {}, { user: undefined }])
      });

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

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: recipient1 }])
      });

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
      const payload = emitter.mock.calls[0][1];
      expect(payload.id).toBeUndefined();
    });
  });

  describe('notifyOrganizationMembers', () => {
    it('throws 400 for invalid actorUserId', async () => {
      await expect(
        notificationService.notifyOrganizationMembers({
          actorUserId: 'bad',
          type: 'DOC_COMMENTED',
          documentId: oid()
        })
      ).rejects.toThrow('Invalid actor user ID');
    });

    it('throws 400 for invalid entityId when using entityKind+entityId', async () => {
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

    it('throws 403 when no active organization', async () => {
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

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

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

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: recipient1 }, { user: recipient2 }])
      });

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

      const [filter, projection] = Membership.find.mock.calls[0];

      expect(filter.organization.toString()).toBe(
        new mongoose.Types.ObjectId(activeOrgId).toString()
      );
      expect(filter.user.$ne.toString()).toBe(new mongoose.Types.ObjectId(actorUserId).toString());
      expect(filter.status).toBe(MembershipStatus.ACTIVE);
      expect(projection).toEqual({ user: 1 });

      expect(NotificationModel.insertMany).toHaveBeenCalledTimes(1);
      const [docsToInsert, options] = NotificationModel.insertMany.mock.calls[0];
      expect(options).toEqual({ ordered: false });
      expect(docsToInsert).toHaveLength(2);
      expect(docsToInsert[0].message).toBe('hello');
      expect(docsToInsert[0].metadata).toEqual({ a: 1 });

      expect(emitter).toHaveBeenCalledTimes(2);

      const [recipientId, payload] = emitter.mock.calls[0];
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

    it('uses defaultEmitter when emitter not provided and swallows emitToUser errors', async () => {
      const actorUserId = oid();
      const documentId = oid();
      const activeOrgId = oid();

      getActiveOrganization.mockResolvedValue(activeOrgId);

      const recipient1 = new mongoose.Types.ObjectId();

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: recipient1 }])
      });

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
      const [docsToInsert] = NotificationModel.insertMany.mock.calls[0];
      expect(docsToInsert[0].message).toBe('');
      expect(docsToInsert[0].metadata).toEqual({});

      expect(res).toBe(inserted);
      expect(emitToUser).toHaveBeenCalledTimes(1);
    });

    it('filters out falsy membership user ids and returns [] if all are invalid', async () => {
      getActiveOrganization.mockResolvedValue(oid());

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: null }, {}, { user: undefined }])
      });

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

      Membership.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ user: recipient1 }])
      });

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
      const payload = emitter.mock.calls[0][1];
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
      });

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
        type: 'MEMBERSHIP_INVITED',
        entityKind: 'membership',
        entityId
      });

      expect(NotificationModel.insertMany).toHaveBeenCalledTimes(1);
      const [docsToInsert] = NotificationModel.insertMany.mock.calls[0];
      expect(docsToInsert[0].entity.kind).toBe('membership');
      expect(docsToInsert[0].entity.id.toString()).toBe(
        new mongoose.Types.ObjectId(entityId).toString()
      );
    });
  });

  describe('listNotifications', () => {
    it('throws 400 for invalid userId', async () => {
      await expect(notificationService.listNotifications({ userId: 'bad' })).rejects.toThrow(
        'Invalid user ID'
      );
    });

    it('uses provided organizationId when valid', async () => {
      const userId = oid();
      const orgId = oid();

      const lean = jest.fn().mockResolvedValue([{ id: 1 }]);
      const limit = jest.fn().mockReturnValue({ lean });
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });

      NotificationModel.find.mockReturnValue({ sort });
      NotificationModel.countDocuments.mockResolvedValue(99);

      const res = await notificationService.listNotifications({
        userId,
        organizationId: orgId,
        unreadOnly: false,
        limit: 10,
        skip: 5
      });

      expect(getActiveOrganization).not.toHaveBeenCalled();

      const queryArg = NotificationModel.find.mock.calls[0][0];

      expect(queryArg.recipient.toString()).toBe(new mongoose.Types.ObjectId(userId).toString());
      expect(queryArg.organization.toString()).toBe(new mongoose.Types.ObjectId(orgId).toString());
      expect(queryArg.readAt).toBeUndefined();

      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(skip).toHaveBeenCalledWith(5);
      expect(limit).toHaveBeenCalledWith(10);
      expect(NotificationModel.countDocuments).toHaveBeenCalledWith(queryArg);

      expect(res).toEqual({ notifications: [{ id: 1 }], total: 99 });
    });

    it('falls back to active organization when organizationId not provided', async () => {
      const userId = oid();
      const activeOrgId = oid();
      getActiveOrganization.mockResolvedValue(activeOrgId);

      const lean = jest.fn().mockResolvedValue([]);
      const limit = jest.fn().mockReturnValue({ lean });
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });

      NotificationModel.find.mockReturnValue({ sort });
      NotificationModel.countDocuments.mockResolvedValue(0);

      const res = await notificationService.listNotifications({ userId });

      expect(getActiveOrganization).toHaveBeenCalledWith(userId);
      expect(res).toEqual({ notifications: [], total: 0 });
    });

    it('throws 403 when no org (provided null or active org missing/invalid)', async () => {
      const userId = oid();

      getActiveOrganization.mockResolvedValue(null);

      await expect(notificationService.listNotifications({ userId })).rejects.toThrow(
        'No active organization. Please create or join an organization first.'
      );

      await expect(
        notificationService.listNotifications({ userId, organizationId: 'bad' })
      ).rejects.toThrow('No active organization. Please create or join an organization first.');
    });

    it('adds readAt=null filter when unreadOnly is true', async () => {
      const userId = oid();
      const orgId = oid();

      const lean = jest.fn().mockResolvedValue([]);
      const limit = jest.fn().mockReturnValue({ lean });
      const skip = jest.fn().mockReturnValue({ limit });
      const sort = jest.fn().mockReturnValue({ skip });

      NotificationModel.find.mockReturnValue({ sort });
      NotificationModel.countDocuments.mockResolvedValue(0);

      await notificationService.listNotifications({
        userId,
        organizationId: orgId,
        unreadOnly: true
      });

      const queryArg = NotificationModel.find.mock.calls[0][0];
      expect(queryArg.readAt).toBeNull();
    });
  });

  describe('markNotificationRead', () => {
    it('throws 400 for invalid userId or notificationId', async () => {
      await expect(notificationService.markNotificationRead('bad', oid())).rejects.toThrow(
        'Invalid user ID'
      );

      await expect(notificationService.markNotificationRead(oid(), 'bad')).rejects.toThrow(
        'Invalid notification ID'
      );
    });

    it('throws 404 when updateOne matchedCount is 0', async () => {
      NotificationModel.updateOne.mockResolvedValue({ matchedCount: 0 });

      await expect(notificationService.markNotificationRead(oid(), oid())).rejects.toThrow(
        'Notification not found'
      );
    });

    it('updates readAt when notification exists', async () => {
      const userId = oid();
      const notificationId = oid();
      NotificationModel.updateOne.mockResolvedValue({ matchedCount: 1 });

      await notificationService.markNotificationRead(userId, notificationId);

      expect(NotificationModel.updateOne).toHaveBeenCalledTimes(1);

      const [filter, update] = NotificationModel.updateOne.mock.calls[0];

      expect(filter._id.toString()).toBe(new mongoose.Types.ObjectId(notificationId).toString());
      expect(filter.recipient.toString()).toBe(new mongoose.Types.ObjectId(userId).toString());

      expect(update).toHaveProperty('$set.readAt');
      expect(update.$set.readAt).toBeInstanceOf(Date);
    });
  });

  describe('markAllRead', () => {
    it('throws 400 for invalid userId', async () => {
      await expect(notificationService.markAllRead('bad')).rejects.toThrow('Invalid user ID');
    });

    it('falls back to active organization when organizationId not provided', async () => {
      const userId = oid();
      const orgId = oid();

      getActiveOrganization.mockResolvedValue(orgId);
      NotificationModel.updateMany.mockResolvedValue({ acknowledged: true });

      await notificationService.markAllRead(userId);

      expect(getActiveOrganization).toHaveBeenCalledWith(userId);

      const [filter, update] = NotificationModel.updateMany.mock.calls[0];

      expect(filter.recipient.toString()).toBe(new mongoose.Types.ObjectId(userId).toString());
      expect(filter.organization.toString()).toBe(new mongoose.Types.ObjectId(orgId).toString());
      expect(filter.readAt).toBeNull();

      expect(update).toHaveProperty('$set.readAt');
      expect(update.$set.readAt).toBeInstanceOf(Date);
    });

    it('throws 403 when orgId missing/invalid', async () => {
      const userId = oid();

      getActiveOrganization.mockResolvedValue(null);

      await expect(notificationService.markAllRead(userId)).rejects.toThrow(
        'No active organization. Please create or join an organization first.'
      );

      await expect(notificationService.markAllRead(userId, 'bad')).rejects.toThrow(
        'No active organization. Please create or join an organization first.'
      );
    });

    it('uses provided valid organizationId', async () => {
      const userId = oid();
      const orgId = oid();

      NotificationModel.updateMany.mockResolvedValue({ acknowledged: true });

      await notificationService.markAllRead(userId, orgId);

      expect(getActiveOrganization).not.toHaveBeenCalled();

      const [filter] = NotificationModel.updateMany.mock.calls[0];
      expect(filter.organization.toString()).toBe(new mongoose.Types.ObjectId(orgId).toString());
    });
  });
});

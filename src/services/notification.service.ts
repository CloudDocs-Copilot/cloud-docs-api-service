import mongoose from 'mongoose';
import HttpError from '../models/error.model';
import NotificationModel, { INotification, NotificationType } from '../models/notification.model';
import { getActiveOrganization } from './membership.service';
import Membership, { MembershipStatus } from '../models/membership.model';
import { emitToUser } from '../socket/socket';

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

export type NotificationEmitter = (recipientUserId: string, payload: any) => void;

export interface CreateOrgNotificationDto {
  actorUserId: string;
  type: NotificationType;
  documentId?: string;
  entityKind?: 'document' | 'membership';
  entityId?: string;
  message?: string;
  metadata?: Record<string, any>;
  emitter?: NotificationEmitter; // optional
}

/**
 * Default realtime emitter using Socket.IO rooms (user:<id>)
 */
const defaultEmitter: NotificationEmitter = (recipientUserId, payload) => {
  try {
    emitToUser(recipientUserId, 'notification:new', payload);
  } catch {
    // noop (realtime should never break persistence)
  }
};

function toEntityFromDto(dto: CreateOrgNotificationDto): {
  kind: 'document' | 'membership';
  id: string;
} {
  if (dto.entityKind && dto.entityId) {
    return { kind: dto.entityKind, id: dto.entityId };
  }
  if (dto.documentId) {
    return { kind: 'document', id: dto.documentId };
  }
  throw new HttpError(400, 'Missing entityId (or documentId) for notification');
}

export interface CreateNotificationDto {
  organizationId: string;
  recipientUserId: string;
  actorUserId: string;
  type: NotificationType;
  entityKind: 'document' | 'membership';
  entityId: string;
  message?: string;
  metadata?: Record<string, any>;
  emitter?: NotificationEmitter;
}

/**
 * Create a single notification for a user within an organization.
 * Persistence in DB + optional realtime emission.
 */
export async function createNotificationForUser({
  organizationId,
  recipientUserId,
  actorUserId,
  type,
  entityKind,
  entityId,
  message,
  metadata,
  emitter
}: CreateNotificationDto): Promise<INotification> {
  if (!isValidObjectId(organizationId)) throw new HttpError(400, 'Invalid organization ID');
  if (!isValidObjectId(recipientUserId)) throw new HttpError(400, 'Invalid recipient user ID');
  if (!isValidObjectId(actorUserId)) throw new HttpError(400, 'Invalid actor user ID');
  if (!isValidObjectId(entityId)) throw new HttpError(400, 'Invalid entity ID');

  const now = new Date();
  const doc = await NotificationModel.create({
    organization: new mongoose.Types.ObjectId(organizationId),
    recipient: new mongoose.Types.ObjectId(recipientUserId),
    actor: new mongoose.Types.ObjectId(actorUserId),
    type,
    entity: { kind: entityKind, id: new mongoose.Types.ObjectId(entityId) },
    message: message || '',
    metadata: metadata || {},
    readAt: null,
    createdAt: now,
    updatedAt: now
  });

  const emitFn = emitter || defaultEmitter;
  emitFn(recipientUserId, {
    id: doc._id?.toString?.() || undefined,
    organization: doc.organization.toString(),
    recipient: doc.recipient.toString(),
    actor: doc.actor.toString(),
    type: doc.type,
    entity: { kind: doc.entity.kind, id: doc.entity.id.toString() },
    message: doc.message,
    metadata: doc.metadata || {},
    readAt: doc.readAt,
    createdAt: doc.createdAt
  });

  return doc;
}

/**
 * Notify all active members of a SPECIFIC organization (except the actor).
 * This does NOT depend on the actor's "active organization".
 */
export async function notifyMembersOfOrganization({
  organizationId,
  actorUserId,
  type,
  entityKind,
  entityId,
  message,
  metadata,
  emitter
}: {
  organizationId: string;
  actorUserId: string;
  type: NotificationType;
  entityKind: 'document' | 'membership';
  entityId: string;
  message?: string;
  metadata?: Record<string, any>;
  emitter?: NotificationEmitter;
}): Promise<INotification[]> {
  if (!isValidObjectId(organizationId)) throw new HttpError(400, 'Invalid organization ID');
  if (!isValidObjectId(actorUserId)) throw new HttpError(400, 'Invalid actor user ID');
  if (!isValidObjectId(entityId)) throw new HttpError(400, 'Invalid entity ID');

  const orgObjectId = new mongoose.Types.ObjectId(organizationId);
  const actorObjectId = new mongoose.Types.ObjectId(actorUserId);

  const memberships = await Membership.find(
    {
      organization: orgObjectId,
      user: { $ne: actorObjectId },
      status: MembershipStatus.ACTIVE
    },
    { user: 1 }
  ).lean();

  const recipientIds = memberships.map((m: any) => m.user?.toString()).filter(Boolean) as string[];
  if (recipientIds.length === 0) return [];

  const now = new Date();
  const docsToInsert = recipientIds.map(recipientId => ({
    organization: orgObjectId,
    recipient: new mongoose.Types.ObjectId(recipientId),
    actor: actorObjectId,
    type,
    entity: { kind: entityKind, id: new mongoose.Types.ObjectId(entityId) },
    message: message || '',
    metadata: metadata || {},
    readAt: null,
    createdAt: now,
    updatedAt: now
  }));

  const inserted = await NotificationModel.insertMany(docsToInsert, { ordered: false });

  const emitFn = emitter || defaultEmitter;
  for (const n of inserted) {
    emitFn(n.recipient.toString(), {
      id: n._id?.toString?.() || undefined,
      organization: n.organization.toString(),
      recipient: n.recipient.toString(),
      actor: n.actor.toString(),
      type: n.type,
      entity: { kind: n.entity.kind, id: n.entity.id.toString() },
      message: n.message,
      metadata: n.metadata || {},
      readAt: n.readAt,
      createdAt: n.createdAt
    });
  }

  return inserted as any;
}

/**
 * Notify all active organization members (except the actor),
 * using the actor's active organization.
 *
 * (Kept for existing document flows that operate within active org context.)
 */
export async function notifyOrganizationMembers({
  actorUserId,
  type,
  documentId,
  entityKind,
  entityId,
  message,
  metadata,
  emitter
}: CreateOrgNotificationDto): Promise<INotification[]> {
  if (!isValidObjectId(actorUserId)) throw new HttpError(400, 'Invalid actor user ID');

  const entity = toEntityFromDto({ actorUserId, type, documentId, entityKind, entityId });
  if (!isValidObjectId(entity.id)) throw new HttpError(400, 'Invalid entity ID');

  const activeOrgId = await getActiveOrganization(actorUserId);
  if (!activeOrgId) {
    throw new HttpError(
      403,
      'No active organization. Please create or join an organization first.'
    );
  }

  return notifyMembersOfOrganization({
    organizationId: activeOrgId,
    actorUserId,
    type,
    entityKind: entity.kind,
    entityId: entity.id,
    message,
    metadata,
    emitter
  });
}

export interface ListNotificationsDto {
  userId: string;
  organizationId?: string | null; // optional, defaults to active org
  unreadOnly?: boolean;
  limit?: number;
  skip?: number;
}

export async function listNotifications({
  userId,
  organizationId,
  unreadOnly = false,
  limit = 20,
  skip = 0
}: ListNotificationsDto): Promise<{ notifications: any[]; total: number }> {
  if (!isValidObjectId(userId)) throw new HttpError(400, 'Invalid user ID');

  let orgId = organizationId;
  if (!orgId) {
    orgId = await getActiveOrganization(userId);
  }
  if (!orgId || !isValidObjectId(orgId)) {
    throw new HttpError(
      403,
      'No active organization. Please create or join an organization first.'
    );
  }

  const query: any = {
    recipient: new mongoose.Types.ObjectId(userId),
    organization: new mongoose.Types.ObjectId(orgId)
  };

  if (unreadOnly) {
    query.readAt = null;
  }

  const [items, total] = await Promise.all([
    NotificationModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    NotificationModel.countDocuments(query)
  ]);

  return { notifications: items as any, total };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  if (!isValidObjectId(userId)) throw new HttpError(400, 'Invalid user ID');
  if (!isValidObjectId(notificationId)) throw new HttpError(400, 'Invalid notification ID');

  const res = await NotificationModel.updateOne(
    {
      _id: new mongoose.Types.ObjectId(notificationId),
      recipient: new mongoose.Types.ObjectId(userId)
    },
    { $set: { readAt: new Date() } }
  );

  if (res.matchedCount === 0) {
    throw new HttpError(404, 'Notification not found');
  }
}

export async function markAllRead(userId: string, organizationId?: string | null): Promise<void> {
  if (!isValidObjectId(userId)) throw new HttpError(400, 'Invalid user ID');

  let orgId = organizationId;
  if (!orgId) {
    orgId = await getActiveOrganization(userId);
  }
  if (!orgId || !isValidObjectId(orgId)) {
    throw new HttpError(
      403,
      'No active organization. Please create or join an organization first.'
    );
  }

  await NotificationModel.updateMany(
    {
      recipient: new mongoose.Types.ObjectId(userId),
      organization: new mongoose.Types.ObjectId(orgId),
      readAt: null
    },
    { $set: { readAt: new Date() } }
  );
}

export default {
  createNotificationForUser,
  notifyMembersOfOrganization,
  notifyOrganizationMembers,
  listNotifications,
  markNotificationRead,
  markAllRead
};

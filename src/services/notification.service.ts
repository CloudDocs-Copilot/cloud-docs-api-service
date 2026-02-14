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
  documentId: string;
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

/**
 * Crea notificaciones para todos los miembros activos de la org (excepto el actor).
 * Persistencia en DB + emisión realtime opcional.
 */
export async function notifyOrganizationMembers({
  actorUserId,
  type,
  documentId,
  message,
  metadata,
  emitter,
}: CreateOrgNotificationDto): Promise<INotification[]> {
  if (!isValidObjectId(actorUserId)) throw new HttpError(400, 'Invalid actor user ID');
  if (!isValidObjectId(documentId)) throw new HttpError(400, 'Invalid document ID');

  const activeOrgId = await getActiveOrganization(actorUserId);
  if (!activeOrgId) {
    throw new HttpError(403, 'No active organization. Please create or join an organization first.');
  }

  const orgObjectId = new mongoose.Types.ObjectId(activeOrgId);
  const actorObjectId = new mongoose.Types.ObjectId(actorUserId);

  // All active memberships in org (exclude actor)
  const memberships = await Membership.find(
    {
      organization: orgObjectId,
      user: { $ne: actorObjectId },
      status: MembershipStatus.ACTIVE,
    },
    { user: 1 }
  ).lean();

  const recipientIds = memberships
    .map((m: any) => m.user?.toString())
    .filter(Boolean) as string[];

  if (recipientIds.length === 0) {
    return [];
  }

  const now = new Date();
  const docsToInsert = recipientIds.map((recipientId) => ({
    organization: orgObjectId,
    recipient: new mongoose.Types.ObjectId(recipientId),
    actor: actorObjectId,
    type,
    entity: { kind: 'document', id: new mongoose.Types.ObjectId(documentId) },
    message: message || '',
    metadata: metadata || {},
    readAt: null,
    createdAt: now,
    updatedAt: now,
  }));

  const inserted = await NotificationModel.insertMany(docsToInsert, { ordered: false });

  // Realtime emit (uses Socket.IO by default)
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
      createdAt: n.createdAt,
    });
  }

  return inserted as any;
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
  skip = 0,
}: ListNotificationsDto): Promise<{ notifications: any[]; total: number }> {
  if (!isValidObjectId(userId)) throw new HttpError(400, 'Invalid user ID');

  let orgId = organizationId;
  if (!orgId) {
    orgId = await getActiveOrganization(userId);
  }
  if (!orgId || !isValidObjectId(orgId)) {
    throw new HttpError(403, 'No active organization. Please create or join an organization first.');
  }

  const query: any = {
    recipient: new mongoose.Types.ObjectId(userId),
    organization: new mongoose.Types.ObjectId(orgId),
  };

  if (unreadOnly) {
    query.readAt = null;
  }

  const [items, total] = await Promise.all([
    NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    NotificationModel.countDocuments(query),
  ]);

  return { notifications: items as any, total };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  if (!isValidObjectId(userId)) throw new HttpError(400, 'Invalid user ID');
  if (!isValidObjectId(notificationId)) throw new HttpError(400, 'Invalid notification ID');

  const res = await NotificationModel.updateOne(
    {
      _id: new mongoose.Types.ObjectId(notificationId),
      recipient: new mongoose.Types.ObjectId(userId),
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
    throw new HttpError(403, 'No active organization. Please create or join an organization first.');
  }

  await NotificationModel.updateMany(
    {
      recipient: new mongoose.Types.ObjectId(userId),
      organization: new mongoose.Types.ObjectId(orgId),
      readAt: null,
    },
    { $set: { readAt: new Date() } }
  );
}

export default {
  notifyOrganizationMembers,
  listNotifications,
  markNotificationRead,
  markAllRead,
};

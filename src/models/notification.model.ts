import mongoose, { Document as MongooseDocument, Schema, Model, Types } from 'mongoose';

export type NotificationType =
  | 'DOC_UPLOADED'
  | 'DOC_EDITED'
  | 'DOC_COMMENTED'
  | 'DOC_SHARED'
  | 'DOC_DELETED'
  | 'INVITATION_CREATED'
  | 'MEMBER_JOINED'
  | 'MEMBER_ROLE_UPDATED';

export interface INotification extends MongooseDocument {
  organization: Types.ObjectId;
  recipient: Types.ObjectId;
  actor: Types.ObjectId;
  type: NotificationType;

  // “what this notification is about”
  entity: {
    kind: 'document' | 'membership';
    id: Types.ObjectId;
  };

  // extra info for UI (keep it small)
  message?: string;
  metadata?: Record<string, any>;

  readAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: [
        'DOC_UPLOADED',
        'DOC_EDITED',
        'DOC_COMMENTED',
        'DOC_SHARED',
        'DOC_DELETED',
        'INVITATION_CREATED',
        'MEMBER_JOINED',
        'MEMBER_ROLE_UPDATED'
      ],
      required: true,
      index: true
    },
    entity: {
      kind: {
        type: String,
        enum: ['document', 'membership'],
        required: true
      },
      id: {
        type: Schema.Types.ObjectId,
        required: true,
        index: true
      }
    },
    message: {
      type: String,
      trim: true,
      maxlength: 512,
      default: ''
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    },
    readAt: {
      type: Date,
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

// Fast queries: unread notifications for user in org
notificationSchema.index({ recipient: 1, organization: 1, readAt: 1, createdAt: -1 });

const NotificationModel: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  notificationSchema
);

export default NotificationModel;

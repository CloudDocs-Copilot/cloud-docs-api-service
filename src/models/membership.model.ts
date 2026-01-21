import { Schema, model, Document, Types } from 'mongoose';

/**
 * Roles de membresía en una organización
 */
export enum MembershipRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer'
}

/**
 * Estado de la membresía
 */
export enum MembershipStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended'
}

/**
 * Interface para la entidad Membership
 */
export interface IMembership extends Document {
  /** Usuario miembro */
  user: Types.ObjectId;
  /** Organización */
  organization: Types.ObjectId;
  /** Rol del usuario en la organización */
  role: MembershipRole;
  /** Estado de la membresía */
  status: MembershipStatus;
  /** Carpeta raíz del usuario en esta organización */
  rootFolder?: Types.ObjectId;
  /** Fecha de ingreso a la organización */
  joinedAt: Date;
  /** Usuario que invitó (opcional) */
  invitedBy?: Types.ObjectId;
  /** Fecha de expiración (para planes temporales) */
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema de Mongoose para Membership
 */
const membershipSchema = new Schema<IMembership>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: [true, 'Organization is required'],
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(MembershipRole),
      default: MembershipRole.MEMBER,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(MembershipStatus),
      default: MembershipStatus.ACTIVE,
      required: true,
    },
    rootFolder: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret._id;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret._id;
        return ret;
      }
    }
  }
);

// Índice compuesto único: un usuario solo puede tener una membresía por organización
membershipSchema.index({ user: 1, organization: 1 }, { unique: true });

// Índice para búsquedas por organización y estado
membershipSchema.index({ organization: 1, status: 1 });

// Índice para búsquedas por usuario y estado
membershipSchema.index({ user: 1, status: 1 });

const Membership = model<IMembership>('Membership', membershipSchema);

export default Membership;

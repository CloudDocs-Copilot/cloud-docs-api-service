import mongoose, { Document as MongooseDocument, Schema, Model, Types } from 'mongoose';

/**
 * Tipo de acción de eliminación
 */
export enum DeletionAction {
  SOFT_DELETE = 'move_to_trash', // Mover a papelera (compatibilidad legacy)
  RESTORE = 'restore_from_trash', // Recuperar de papelera (compatibilidad legacy)
  PERMANENT_DELETE = 'permanent_delete', // Eliminación definitiva
  SECURE_OVERWRITE = 'secure_overwrite', // Sobrescritura segura del archivo
  AUTO_DELETE = 'auto_delete' // Eliminación automática (30 días)
}

/**
 * Estado de la eliminación
 */
export enum DeletionStatus {
  PENDING = 'pending', // Pendiente de confirmación
  CONFIRMED = 'confirmed', // Confirmado por el usuario
  COMPLETED = 'completed', // Eliminación completada
  FAILED = 'failed', // Falló la eliminación
  CANCELLED = 'cancelled' // Cancelado por el usuario
}

/**
 * Interfaz del modelo de Auditoría de Eliminación
 * Cumple con GDPR - Artículo 30 (Registro de actividades de tratamiento)
 */
export interface IDeletionAudit extends MongooseDocument {
  /** Documento afectado */
  document: Types.ObjectId;
  /** Legacy alias for document id */
  documentId?: Types.ObjectId;
  /** Información del documento eliminado (snapshot) */
  documentSnapshot: {
    filename: string;
    originalname: string;
    size: number;
    mimeType: string;
    path: string;
    organization?: Types.ObjectId;
  };
  /** Usuario que realizó la acción */
  performedBy: Types.ObjectId;
  /** Organización (para multi-tenancy) */
  organization?: Types.ObjectId;
  /** Tipo de acción realizada */
  action: DeletionAction;
  /** Estado de la eliminación */
  status: DeletionStatus;
  /** Razón de la eliminación (opcional, proporcionada por el usuario) */
  reason?: string;
  /** IP desde donde se realizó la acción */
  ipAddress?: string;
  /** User Agent del cliente */
  userAgent?: string;
  /** Fecha de confirmación (para eliminaciones que requieren múltiples confirmaciones) */
  confirmedAt?: Date;
  /** Fecha en que se completó la eliminación */
  completedAt?: Date;
  /** Mensaje de error si la eliminación falló */
  errorMessage?: string;
  /** Método de sobrescritura utilizado (si aplica) */
  overwriteMethod?: 'DoD 5220.22-M' | 'Gutmann' | 'simple';
  /** Número de pasadas de sobrescritura realizadas */
  overwritePasses?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema de Mongoose para Auditoría de Eliminación
 *
 * Características:
 * - Registro completo de todas las acciones de eliminación
 * - Snapshot del documento para cumplimiento GDPR
 * - Información de IP y User Agent para seguridad
 * - Estados para seguimiento del proceso
 */
const deletionAuditSchema = new Schema<IDeletionAudit>(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: [true, 'Document reference is required'],
      index: true
    },
    // Legacy alias to support older queries that used `documentId`
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: false,
      index: true,
      default: null
    },
    documentSnapshot: {
      filename: {
        type: String,
        required: true
      },
      originalname: {
        type: String,
        required: true
      },
      size: {
        type: Number,
        required: true
      },
      mimeType: {
        type: String,
        required: true
      },
      path: {
        type: String,
        required: true
      },
      organization: {
        type: Schema.Types.ObjectId,
        ref: 'Organization',
        default: null
      }
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User who performed the action is required'],
      index: true
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      default: null
    },
    action: {
      type: String,
      enum: Object.values(DeletionAction),
      required: [true, 'Deletion action is required'],
      index: true
    },
    status: {
      type: String,
      enum: Object.values(DeletionStatus),
      required: [true, 'Deletion status is required'],
      default: DeletionStatus.PENDING,
      index: true
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    ipAddress: {
      type: String,
      trim: true
    },
    userAgent: {
      type: String,
      trim: true
    },
    confirmedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null,
      index: true
    },
    errorMessage: {
      type: String,
      trim: true
    },
    overwriteMethod: {
      type: String,
      enum: {
        values: ['DoD 5220.22-M', 'Gutmann', 'simple'],
        message: '{VALUE} is not a valid overwrite method'
      },
      required: false,
      default: undefined
    },
    overwritePasses: {
      type: Number,
      min: [0, 'Overwrite passes cannot be negative'],
      max: [35, 'Maximum 35 passes (Gutmann method)'],
      required: false,
      default: undefined
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret): unknown => {
        delete ret._id;
        return ret;
      }
    }
  }
);

// Índices compuestos
deletionAuditSchema.index({ organization: 1, createdAt: -1 }); // Auditoría por organización
deletionAuditSchema.index({ performedBy: 1, action: 1 }); // Acciones por usuario
deletionAuditSchema.index({ status: 1, createdAt: -1 }); // Por estado
deletionAuditSchema.index({ document: 1, action: 1 }); // Historial de un documento

const DeletionAuditModel: Model<IDeletionAudit> = mongoose.model<IDeletionAudit>(
  'DeletionAudit',
  deletionAuditSchema
);

export default DeletionAuditModel;

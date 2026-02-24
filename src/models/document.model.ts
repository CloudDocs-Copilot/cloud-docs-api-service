import mongoose, { Document as MongooseDocument, Schema, Model, Types } from 'mongoose';

/**
 * Interfaz del modelo de Documento
 * Define la estructura de datos para los archivos subidos al sistema
 */
export interface IDocument extends MongooseDocument {
  /** Nombre del archivo en el sistema de archivos */
  filename?: string;
  /** Nombre original del archivo subido por el usuario */
  originalname?: string;
  /** URL del archivo (opcional, para acceso directo) */
  url?: string;
  /** Usuario que subió el archivo */
  uploadedBy: Types.ObjectId;
  /** Organización a la que pertenece el documento (opcional para usuarios sin organización) */
  organization?: Types.ObjectId;
  /** Carpeta que contiene el documento (OBLIGATORIO) */
  folder: Types.ObjectId;
  /** Path completo del archivo en el filesystem */
  path: string;
  /** Tamaño del archivo en bytes */
  size: number;
  /** Tipo MIME del archivo */
  mimeType: string;
  /** Fecha de subida (deprecated, usar createdAt) */
  uploadedAt: Date;
  /** Usuarios con quienes se comparte el documento */
  sharedWith: Types.ObjectId[];

  // 🤖 AI Processing Metadata (RFE-AI-002)
  /** Estado del procesamiento AI del documento */
  aiProcessingStatus?: 'none' | 'pending' | 'processing' | 'completed' | 'failed';
  /** Categoría del documento asignada por IA */
  aiCategory?: string | null;
  /** Nivel de confianza de la clasificación (0-1) */
  aiConfidence?: number | null;
  /** Tags generados automáticamente por IA */
  aiTags?: string[];
  /** Resumen del documento generado por IA */
  aiSummary?: string | null;
  /** Puntos clave extraídos del documento */
  aiKeyPoints?: string[];
  /** Texto completo extraído del documento (no incluido por defecto) */
  extractedText?: string | null;
  /** Fecha en que se completó el procesamiento AI */
  aiProcessedAt?: Date | null;
  /** Mensaje de error si el procesamiento AI falló */
  aiError?: string | null;

  /** Indica si el documento está marcado como eliminado (soft delete) */
  isDeleted: boolean;
  /** Fecha en que el documento fue marcado como eliminado */
  deletedAt?: Date;
  /** Razón por la cual el documento fue movido a la papelera */
  deletionReason?: string | null;
  /** Usuario que eliminó el documento */
  deletedBy?: Types.ObjectId;
  /** Fecha programada para eliminación permanente (30 días después de deletedAt) */
  scheduledDeletionDate?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Métodos de instancia
  /**
   * Verifica si el documento es propiedad del usuario especificado
   * @param userId - ID del usuario a verificar
   * @returns true si el usuario es el propietario
   */
  isOwnedBy(userId: string | Types.ObjectId): boolean;

  /**
   * Verifica si el documento está compartido con el usuario especificado
   * @param userId - ID del usuario a verificar
   * @returns true si el documento está compartido con el usuario
   */
  isSharedWith(userId: string | Types.ObjectId): boolean;

  /**
   * Obtiene el tipo de acceso del usuario al documento
   * @param userId - ID del usuario a verificar
   * @returns 'owner' | 'shared' | 'none'
   */
  getAccessType(userId: string | Types.ObjectId): 'owner' | 'shared' | 'none';
}

/**
 * Schema de Mongoose para el modelo de Documento
 *
 * Características:
 * - Organización para multi-tenancy
 * - Carpeta obligatoria para estructura jerárquica
 * - Path completo en filesystem
 * - Metadata del archivo (tamaño, tipo MIME)
 * - Índices optimizados para consultas
 */
const documentSchema = new Schema<IDocument>(
  {
    filename: {
      type: String,
      trim: true,
      maxlength: [255, 'Filename cannot exceed 255 characters']
    },
    originalname: {
      type: String,
      trim: true,
      maxlength: [255, 'Original filename cannot exceed 255 characters']
    },
    url: {
      type: String,
      trim: true,
      maxlength: [2048, 'URL cannot exceed 2048 characters']
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User who uploaded the document is required'],
      index: true
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: false,
      index: true,
      default: null
    },
    folder: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      required: [true, 'Folder is required'],
      index: true
    },
    path: {
      type: String,
      required: [true, 'File path is required'],
      trim: true,
      maxlength: [1024, 'File path cannot exceed 1024 characters']
    },
    size: {
      type: Number,
      required: [true, 'File size is required'],
      min: [0, 'File size cannot be negative'],
      max: [10737418240, 'File size cannot exceed 10GB']
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
      trim: true,
      maxlength: [127, 'MIME type cannot exceed 127 characters'],
      match: [/^[a-z]+\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i, 'Invalid MIME type format']
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    sharedWith: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    ],

    // 🤖 AI Processing Metadata (RFE-AI-002)
    aiProcessingStatus: {
      type: String,
      enum: ['none', 'pending', 'processing', 'completed', 'failed'],
      default: 'none',
      index: true // Para filtrar documentos pendientes de procesamiento
    },
    aiCategory: {
      type: String,
      default: null,
      index: true // Para búsqueda y filtrado por categoría
    },
    aiConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null
    },
    aiTags: {
      type: [String],
      default: [],
      index: true // Para búsqueda por tags
    },
    aiSummary: {
      type: String,
      default: null,
      maxlength: [2000, 'AI summary cannot exceed 2000 characters']
    },
    aiKeyPoints: {
      type: [String],
      default: []
    },
    extractedText: {
      type: String,
      default: null,
      select: false // No incluir por defecto (puede ser muy grande)
    },
    aiProcessedAt: {
      type: Date,
      default: null,
      index: true
    },
    aiError: {
      type: String,
      default: null,
      maxlength: [500, 'AI error message cannot exceed 500 characters']
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Deletion reason cannot exceed 500 characters'],
      default: null
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    scheduledDeletionDate: {
      type: Date,
      default: null,
      index: true // Índice para el job de eliminación automática
    }
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

// Índices compuestos para optimizar consultas
documentSchema.index({ organization: 1, folder: 1 });
documentSchema.index({ organization: 1, uploadedBy: 1 });
documentSchema.index({ uploadedBy: 1, createdAt: -1 }); // Para documentos recientes
documentSchema.index({ sharedWith: 1 }); // Para documentos compartidos
documentSchema.index({ isDeleted: 1, scheduledDeletionDate: 1 }); // Para papelera y eliminación automática
// Índice para documentos personales (sin organización)
documentSchema.index(
  { uploadedBy: 1, folder: 1 },
  { sparse: true, partialFilterExpression: { organization: null } }
);

/**
 * Método de instancia: Verifica si el documento es propiedad del usuario especificado
 */
documentSchema.methods.isOwnedBy = function (userId: string | Types.ObjectId): boolean {
  return this.uploadedBy.toString() === userId.toString();
};

/**
 * Método de instancia: Verifica si el documento está compartido con el usuario especificado
 */
documentSchema.methods.isSharedWith = function (userId: string | Types.ObjectId): boolean {
  if (!this.sharedWith || this.sharedWith.length === 0) {
    return false;
  }
  return this.sharedWith.some((id: Types.ObjectId) => id.toString() === userId.toString());
};

/**
 * Método de instancia: Obtiene el tipo de acceso del usuario al documento
 */
documentSchema.methods.getAccessType = function (
  userId: string | Types.ObjectId
): 'owner' | 'shared' | 'none' {
  if (this.isOwnedBy(userId)) {
    return 'owner';
  }
  if (this.isSharedWith(userId)) {
    return 'shared';
  }
  return 'none';
};

const DocumentModel: Model<IDocument> = mongoose.model<IDocument>('Document', documentSchema);

export default DocumentModel;

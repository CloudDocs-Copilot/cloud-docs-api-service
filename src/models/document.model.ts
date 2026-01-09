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
  /** Organización a la que pertenece el documento */
  organization: Types.ObjectId;
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
  createdAt: Date;
  updatedAt: Date;
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
    },
    originalname: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      trim: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    folder: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      required: true,
      index: true,
    },
    path: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
      min: [0, 'File size cannot be negative'],
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    sharedWith: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
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

const DocumentModel: Model<IDocument> = mongoose.model<IDocument>('Document', documentSchema);

export default DocumentModel;

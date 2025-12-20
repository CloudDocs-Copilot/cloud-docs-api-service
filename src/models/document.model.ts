import mongoose, { Document as MongooseDocument, Schema, Model, Types } from 'mongoose';

/**
 * Interfaz del modelo de Documento
 * Define la estructura de datos para los archivos subidos al sistema
 */
export interface IDocument extends MongooseDocument {
  filename?: string;
  originalname?: string;
  url?: string;
  uploadedBy: Types.ObjectId;
  folder?: Types.ObjectId;
  uploadedAt: Date;
  sharedWith: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema de Mongoose para el modelo de Documento
 * 
 * Características:
 * - Referencia al usuario que subió el archivo
 * - Referencia opcional a una carpeta contenedora
 * - Lista de usuarios con quienes se comparte
 * - Timestamps automáticos
 * - Transformación automática para eliminar _id en respuestas
 */
const documentSchema = new Schema<IDocument>(
  {
    filename: String,
    originalname: String,
    url: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    folder: { type: Schema.Types.ObjectId, ref: 'Folder' },
    uploadedAt: { type: Date, default: Date.now }, // Mantenido por compatibilidad; createdAt también disponible
    sharedWith: [{ type: Schema.Types.ObjectId, ref: 'User' }]
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

const DocumentModel: Model<IDocument> = mongoose.model<IDocument>('Document', documentSchema);

export default DocumentModel;

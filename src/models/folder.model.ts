import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/**
 * Interfaz del modelo de Carpeta
 * Define la estructura de datos para las carpetas del sistema
 */
export interface IFolder extends Document {
  name: string;
  owner: Types.ObjectId;
  documents: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema de Mongoose para el modelo de Carpeta
 * 
 * Características:
 * - Referencia al usuario propietario
 * - Lista de documentos contenidos
 * - Índice único compuesto (owner + name) para evitar nombres duplicados por usuario
 * - Timestamps automáticos
 * - Transformación automática para eliminar _id en respuestas
 */
const folderSchema = new Schema<IFolder>(
  {
    name: { type: String, required: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documents: [{ type: Schema.Types.ObjectId, ref: 'Document' }]
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

/**
 * Índice único compuesto: nombre de carpeta único por propietario
 * Permite que diferentes usuarios tengan carpetas con el mismo nombre
 */
folderSchema.index({ owner: 1, name: 1 }, { unique: true });

const Folder: Model<IFolder> = mongoose.model<IFolder>('Folder', folderSchema);

export default Folder;

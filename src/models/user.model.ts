import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * Interfaz del modelo de Usuario
 * Define la estructura de datos para los usuarios del sistema
 */
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  active: boolean;
  tokenVersion: number;
  lastPasswordChange?: Date;
  /** Referencia a la organización a la que pertenece el usuario */
  organization?: Types.ObjectId;
  /** Referencia a la carpeta raíz personal del usuario */
  rootFolder?: Types.ObjectId;
  /** Almacenamiento utilizado por el usuario en bytes */
  storageUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema de Mongoose para el modelo de Usuario
 * 
 * Características:
 * - Email único
 * - Contraseña hasheada (nunca se expone en JSON)
 * - Sistema de versionado de tokens para invalidación
 * - Timestamps automáticos (createdAt, updatedAt)
 * - Transformación automática para eliminar datos sensibles en respuestas
 */
const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    active: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    lastPasswordChange: { type: Date },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
    },
    rootFolder: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
    },
    storageUsed: {
      type: Number,
      default: 0,
      min: [0, 'Storage used cannot be negative'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret._id;
        delete ret.password;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret._id;
        delete ret.password;
        return ret;
      }
    }
  }
);

// Índice compuesto para optimizar búsquedas por organización y email
userSchema.index({ organization: 1, email: 1 });
// Índice para búsquedas por organización y estado activo
userSchema.index({ organization: 1, active: 1 });

export default mongoose.model<IUser>('User', userSchema);

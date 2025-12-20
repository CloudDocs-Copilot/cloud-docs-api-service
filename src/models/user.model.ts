import mongoose, { Document, Schema } from 'mongoose';

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
    lastPasswordChange: { type: Date }
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

export default mongoose.model<IUser>('User', userSchema);

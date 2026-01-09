import { Schema, model, Model, Types } from 'mongoose';
import { IOrganization } from './types/organization.types';

/**
 * Interface para métodos estáticos del modelo Organization
 */
interface IOrganizationModel extends Model<IOrganization> {
  findBySlug(slug: string): Promise<IOrganization | null>;
}

/**
 * Genera un slug único URL-safe a partir de un nombre
 * @param name - Nombre de la organización
 * @returns Slug en formato URL-safe
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Reemplazar caracteres especiales con sus equivalentes
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    // Reemplazar espacios y caracteres no permitidos con guiones
    .replace(/[^a-z0-9]+/g, '-')
    // Eliminar guiones múltiples
    .replace(/-+/g, '-')
    // Eliminar guiones al inicio y final
    .replace(/^-|-$/g, '');
}

/**
 * Schema de Mongoose para el modelo Organization
 */
const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      minlength: [2, 'Organization name must be at least 2 characters'],
      maxlength: [100, 'Organization name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Organization owner is required'],
      index: true,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    settings: {
      maxStoragePerUser: {
        type: Number,
        required: true,
        default: 5368709120, // 5GB en bytes
        min: [0, 'Storage limit cannot be negative'],
      },
      allowedFileTypes: {
        type: [String],
        default: ['*'], // Por defecto permite todos los tipos
      },
      maxUsers: {
        type: Number,
        min: [1, 'Maximum users must be at least 1'],
        default: 100,
      },
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
    collection: 'organizations',
  }
);

// Índices compuestos para optimizar consultas
organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ owner: 1, active: 1 });
organizationSchema.index({ members: 1 });

// Virtual para contar miembros
organizationSchema.virtual('memberCount').get(function (this: IOrganization) {
  return this.members?.length || 0;
});

// Middleware pre-save para generar slug automáticamente si no existe
organizationSchema.pre('save', async function (next) {
  if (!this.slug || this.isModified('name')) {
    let slug = generateSlug(this.name);
    let slugExists = true;
    let counter = 0;

    // Asegurar que el slug sea único
    while (slugExists) {
      const existingOrg = await model<IOrganization>('Organization').findOne({
        slug: counter > 0 ? `${slug}-${counter}` : slug,
        _id: { $ne: this._id },
      });

      if (!existingOrg) {
        slugExists = false;
        this.slug = counter > 0 ? `${slug}-${counter}` : slug;
      } else {
        counter++;
      }
    }
  }

  // Asegurar que el owner esté en la lista de members
  if (this.isNew && !this.members.includes(this.owner)) {
    this.members.push(this.owner);
  }

  next();
});

// Método de instancia para agregar un miembro
organizationSchema.methods.addMember = function (userId: string) {
  if (!this.members.includes(userId as any)) {
    this.members.push(userId as any);
  }
};

// Método de instancia para remover un miembro
organizationSchema.methods.removeMember = function (userId: string) {
  this.members = this.members.filter(
    (memberId: Types.ObjectId) => memberId.toString() !== userId.toString()
  );
};

// Método estático para buscar por slug
organizationSchema.statics.findBySlug = function (slug: string) {
  return this.findOne({ slug, active: true });
};

// Configuración para que los virtuals se incluyan en JSON
organizationSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.id; // Eliminar el campo 'id' duplicado que genera mongoose
    return ret;
  },
});

organizationSchema.set('toObject', {
  virtuals: true,
});

/**
 * Modelo de Mongoose para Organization
 */
const Organization = model<IOrganization, IOrganizationModel>('Organization', organizationSchema);

export default Organization;

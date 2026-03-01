import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/**
 * Tipo de carpeta en el sistema
 * - root: Carpeta raíz personal del usuario
 * - folder: Carpeta normal creada por el usuario
 * - shared: Carpeta compartida
 */
export type FolderType = 'root' | 'folder' | 'shared';

/**
 * Roles de permisos para carpetas compartidas
 */
export type FolderPermissionRole = 'viewer' | 'editor' | 'owner';

/**
 * Interfaz para permisos de carpeta
 */
export interface IFolderPermission {
  userId: Types.ObjectId;
  role: FolderPermissionRole;
}

/**
 * Interfaz del modelo de Carpeta
 * Define la estructura de datos para las carpetas del sistema
 */
export interface IFolder extends Document {
  _id: Types.ObjectId;
  /** Identificador técnico de la carpeta (ej: root_user_{userId} para carpetas raíz) */
  name: string;
  /** Nombre para mostrar (opcional, si no se especifica se usa name) */
  displayName?: string;
  /** Tipo de carpeta */
  type: FolderType;
  /** Usuario propietario de la carpeta */
  owner: Types.ObjectId;
  /** Organización a la que pertenece la carpeta (opcional para usuarios sin organización) */
  organization?: Types.ObjectId;
  /** Carpeta padre (null para carpetas raíz) */
  parent: Types.ObjectId | null;
  /** Indica si es una carpeta raíz de usuario */
  isRoot: boolean;
  /** Path completo de la carpeta en el filesystem */
  path: string;
  /** Lista de documentos contenidos en esta carpeta */
  documents: Types.ObjectId[];
  /** Usuarios con los que se ha compartido esta carpeta */
  sharedWith: Types.ObjectId[];
  /** Permisos detallados por usuario */
  permissions: IFolderPermission[];
  createdAt: Date;
  updatedAt: Date;
  /** Virtual: Nombre visible (displayName o name) */
  visibleName?: string;
  /** Método para verificar acceso de un usuario */
  hasAccess(userId: string, requiredRole?: FolderPermissionRole): boolean;
  /** Método para compartir carpeta con un usuario */
  shareWith(userId: string | Types.ObjectId, role?: FolderPermissionRole): void;
  /** Método para remover acceso de un usuario */
  unshareWith(userId: string): void;
}

/**
 * Schema de Mongoose para el modelo de Carpeta
 *
 * Características:
 * - Estructura jerárquica con parent/child
 * - Multi-tenancy con organización
 * - Sistema de permisos granular
 * - Path completo para filesystem
 * - Índices optimizados para consultas frecuentes
 */
const folderSchema = new Schema<IFolder>(
  {
    name: {
      type: String,
      required: [true, 'Folder name is required'],
      trim: true,
      minlength: [1, 'Folder name must be at least 1 character'],
      maxlength: [255, 'Folder name cannot exceed 255 characters']
    },
    displayName: {
      type: String,
      trim: true,
      minlength: [1, 'Display name must be at least 1 character'],
      maxlength: [255, 'Display name cannot exceed 255 characters']
    },
    type: {
      type: String,
      enum: {
        values: ['root', 'folder', 'shared'],
        message: '{VALUE} is not a valid folder type'
      },
      default: 'folder',
      required: [true, 'Folder type is required']
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Folder owner is required'],
      index: true
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: false,
      index: true,
      default: null
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
      index: true
    },
    isRoot: {
      type: Boolean,
      default: false,
      index: true
    },
    path: {
      type: String,
      required: [true, 'Folder path is required'],
      trim: true,
      maxlength: [1024, 'Folder path cannot exceed 1024 characters']
    },
    documents: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Document'
      }
    ],
    sharedWith: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    permissions: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        role: {
          type: String,
          enum: {
            values: ['viewer', 'editor', 'owner'],
            message: '{VALUE} is not a valid permission role'
          },
          required: [true, 'Permission role is required']
        }
      }
    ]
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
    },
    toObject: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret): unknown => {
        delete ret._id;
        return ret;
      }
    }
  }
);

/**
 * Índices para optimizar consultas
 */
// Índice compuesto para buscar carpetas por organización y propietario
folderSchema.index({ organization: 1, owner: 1 });
// Índice para buscar carpetas hijas de una carpeta padre
folderSchema.index({ organization: 1, parent: 1 });
// Índice para encontrar la carpeta raíz de un usuario
folderSchema.index({ owner: 1, isRoot: 1 });
// Índice para buscar por nombre dentro de una organización y padre
folderSchema.index({ organization: 1, parent: 1, name: 1 });
// Índice adicional para usuarios sin organización (carpetas personales)
folderSchema.index(
  { owner: 1, parent: 1 },
  { sparse: true, partialFilterExpression: { organization: null } }
);

/**
 * Virtual para obtener el nombre a mostrar
 * Si no hay displayName, usa el name técnico
 */
folderSchema.virtual('visibleName').get(function (this: IFolder) {
  return this.displayName || this.name;
});

/**
 * Método de instancia para verificar si un usuario tiene acceso
 */
folderSchema.methods.hasAccess = function (
    this: IFolder,
  userId: string,
  requiredRole?: FolderPermissionRole
): boolean {
  const userIdStr = userId.toString();

  // El owner siempre tiene acceso completo
  if (this.owner.toString() === userIdStr) {
    return true;
  }

  // Verificar en la lista de permisos
  const permission = this.permissions.find(
    (p: IFolderPermission) => p.userId.toString() === userIdStr
  );

  if (!permission) {
    return false;
  }

  // Si no se requiere un rol específico, cualquier permiso es suficiente
  if (!requiredRole) {
    return true;
  }

  // Verificar jerarquía de roles: owner > editor > viewer
  const roleHierarchy: Record<FolderPermissionRole, number> = {
    owner: 3,
    editor: 2,
    viewer: 1
  };

  return (
    (roleHierarchy[permission.role] ?? 0) >= roleHierarchy[requiredRole]
  );
};

/**
 * Método de instancia para compartir carpeta con un usuario
 */
folderSchema.methods.shareWith = function (
    this: IFolder,
  userId: string | Types.ObjectId,
  role: FolderPermissionRole = 'viewer'
): void {
  const userIdStr = userId.toString();

  // No compartir con el owner
  if (this.owner.toString() === userIdStr) {
    return;
  }

  // Verificar si ya está compartido
  const existingPermission = this.permissions.find(
    (p: IFolderPermission) => p.userId.toString() === userIdStr
  );

  if (existingPermission) {
    // Actualizar rol
    existingPermission.role = role;
  } else {
    // Agregar nuevo permiso
    const objectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    this.permissions.push({ userId: objectId, role });
    if (!this.sharedWith.some((id: Types.ObjectId) => id.toString() === userIdStr)) {
      this.sharedWith.push(objectId);
    }
  }
};

/**
 * Método de instancia para remover acceso de un usuario
 */
folderSchema.methods.unshareWith = function (this: IFolder, userId: string): void {
  const userIdStr = userId.toString();

  this.permissions = this.permissions.filter(
    (p: IFolderPermission) => p.userId.toString() !== userIdStr
  );
  this.sharedWith = this.sharedWith.filter((id: Types.ObjectId) => id.toString() !== userIdStr);
};

const Folder: Model<IFolder> = mongoose.model<IFolder>('Folder', folderSchema);

export default Folder;

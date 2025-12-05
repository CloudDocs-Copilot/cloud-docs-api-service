import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IFolder extends Document {
  name: string;
  owner: Types.ObjectId;
  documents: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

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

// Nombre de carpeta único por propietario
folderSchema.index({ owner: 1, name: 1 }, { unique: true });

const Folder: Model<IFolder> = mongoose.model<IFolder>('Folder', folderSchema);

export default Folder;

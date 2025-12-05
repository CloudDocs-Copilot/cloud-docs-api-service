import mongoose, { Document as MongooseDocument, Schema, Model, Types } from 'mongoose';

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

const documentSchema = new Schema<IDocument>(
  {
    filename: String,
    originalname: String,
    url: String,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    folder: { type: Schema.Types.ObjectId, ref: 'Folder' },
    uploadedAt: { type: Date, default: Date.now }, // mantenido por compatibilidad hacia atrás; createdAt también disponible por timestamps
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

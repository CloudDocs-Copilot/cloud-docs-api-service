import mongoose, { Document as MongooseDocument, Schema, Model, Types } from 'mongoose';

export interface IComment extends MongooseDocument {
  document: Types.ObjectId;
  organization?: Types.ObjectId;
  createdBy: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    document: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: [true, 'Documento es requerido'],
      index: true
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: false,
      index: true,
      default: null
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'createdBy es requerido'],
      index: true
    },
    content: {
      type: String,
      required: [true, 'Contenido es requerido'],
      trim: true,
      minlength: [1, 'Contenido debe tener al menos 1 caracter'],
      maxlength: [2000, 'Contenido no puede exceder 2000 caracteres']
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret): Record<string, unknown> => {
        delete ret._id;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret): Record<string, unknown> => {
        delete ret._id;
        return ret;
      }
    }
  }
);

commentSchema.index({ document: 1, createdAt: -1 });
commentSchema.index({ organization: 1, createdAt: -1 });

const CommentModel: Model<IComment> = mongoose.model<IComment>('Comment', commentSchema);
export default CommentModel;

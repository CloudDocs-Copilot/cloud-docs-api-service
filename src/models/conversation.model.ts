import mongoose, { Document, Schema, Types } from 'mongoose';

// ---------------------------------------------------------------------------
// Sub-interfaces
// ---------------------------------------------------------------------------

export interface IChunk {
  documentId: string;
  content: string;
  score: number;
}

export interface IMessage {
  _id: Types.ObjectId;
  question: string;
  answer: string;
  sources: string[];
  chunks: IChunk[];
  mode: 'org' | 'document';
  documentId: string | null;
  documentName: string | null;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Main document interface
// ---------------------------------------------------------------------------

export interface IConversation extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  mode: 'org' | 'document';
  documentId: Types.ObjectId | null;
  documentName: string | null;
  messages: IMessage[];
  messageCount: number;
  lastActivity: Date;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const chunkSchema = new Schema<IChunk>(
  {
    documentId: { type: String, required: true },
    content: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const messageSchema = new Schema<IMessage>(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    sources: [{ type: String }],
    chunks: [chunkSchema],
    mode: { type: String, enum: ['org', 'document'], required: true },
    documentId: { type: String, default: null },
    documentName: { type: String, default: null },
    timestamp: { type: Date, required: true },
  },
  { timestamps: false }
);

// ---------------------------------------------------------------------------
// Main conversation schema
// ---------------------------------------------------------------------------

const conversationSchema = new Schema<IConversation>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 120 },
    mode: { type: String, enum: ['org', 'document'], required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    documentName: { type: String, default: null },
    messages: [messageSchema],
    messageCount: { type: Number, default: 0 },
    lastActivity: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound index for paginated listing per user+org
conversationSchema.index(
  { organizationId: 1, userId: 1, isDeleted: 1, lastActivity: -1 }
);

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export const Conversation = mongoose.model<IConversation>('Conversation', conversationSchema);
export default Conversation;

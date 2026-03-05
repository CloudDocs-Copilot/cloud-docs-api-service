import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth.middleware';
import { Conversation } from '../models/conversation.model';
import HttpError from '../models/error.model';

// ---------------------------------------------------------------------------
// DTO / response shape helpers
// ---------------------------------------------------------------------------

interface ConversationSummary {
  id: string;
  title: string;
  mode: 'org' | 'document';
  documentId?: string;
  documentName?: string;
  messageCount: number;
  lastActivity: string;
  createdAt: string;
}

interface StoredChunk {
  documentId: string;
  content: string;
  score: number;
}

interface StoredMessage {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  chunks: StoredChunk[];
  mode: 'org' | 'document';
  documentId?: string;
  documentName?: string;
  timestamp: string;
}

interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[];
  organizationId: string;
  userId: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function toSummary(doc: {
  _id: mongoose.Types.ObjectId;
  title: string;
  mode: 'org' | 'document';
  documentId?: mongoose.Types.ObjectId | null;
  documentName?: string | null;
  messageCount: number;
  lastActivity: Date;
  createdAt: Date;
}): ConversationSummary {
  return {
    id: doc._id.toString(),
    title: doc.title,
    mode: doc.mode,
    ...(doc.documentId ? { documentId: doc.documentId.toString() } : {}),
    ...(doc.documentName ? { documentName: doc.documentName } : {}),
    messageCount: doc.messageCount,
    lastActivity: doc.lastActivity.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /api/ai/conversations
// ---------------------------------------------------------------------------

export async function listConversations(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organization!._id.toString();
    const userId = req.user!.id;

    const query = req.query as Record<string, unknown>;

    const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
    const rawLimit = parseInt(String(query.limit ?? '20'), 10) || 20;
    const limit = Math.min(rawLimit, 50);
    const mode = typeof query.mode === 'string' ? query.mode : undefined;

    const filter: Record<string, unknown> = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      userId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    };

    if (mode === 'org' || mode === 'document') {
      filter.mode = mode;
    }

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .select('-messages')
        .sort({ lastActivity: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Conversation.countDocuments(filter),
    ]);

    const summaries: ConversationSummary[] = conversations.map(c =>
      toSummary({
        _id: c._id as mongoose.Types.ObjectId,
        title: c.title,
        mode: c.mode,
        documentId: c.documentId as mongoose.Types.ObjectId | null,
        documentName: c.documentName,
        messageCount: c.messageCount,
        lastActivity: c.lastActivity,
        createdAt: c.createdAt,
      })
    );

    res.json({
      success: true,
      data: { conversations: summaries, total, page, limit },
    });
  } catch (err: unknown) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/conversations
// ---------------------------------------------------------------------------

export async function createConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organization!._id.toString();
    const userId = req.user!.id;

    const body = req.body as Record<string, unknown>;
    const title = body.title;
    const mode = body.mode;
    const documentId = body.documentId;
    const documentName = body.documentName;

    if (typeof title !== 'string' || title.trim().length === 0) {
      return next(new HttpError(400, 'title is required'));
    }

    if (title.length > 120) {
      return next(new HttpError(400, 'title must be 120 characters or fewer'));
    }

    if (mode !== 'org' && mode !== 'document') {
      return next(new HttpError(400, 'mode must be "org" or "document"'));
    }

    if (mode === 'document' && (typeof documentId !== 'string' || documentId.trim().length === 0)) {
      return next(new HttpError(400, 'documentId is required when mode is "document"'));
    }

    const conversation = await Conversation.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      userId: new mongoose.Types.ObjectId(userId),
      title: title.trim(),
      mode,
      documentId:
        mode === 'document' && typeof documentId === 'string'
          ? new mongoose.Types.ObjectId(documentId)
          : null,
      documentName:
        typeof documentName === 'string' ? documentName : null,
      messages: [],
      messageCount: 0,
      lastActivity: new Date(),
      isDeleted: false,
      deletedAt: null,
    });

    res.status(201).json({
      success: true,
      data: { conversation: toSummary(conversation) },
    });
  } catch (err: unknown) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/ai/conversations/:id
// ---------------------------------------------------------------------------

export async function getConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organization!._id.toString();
    const userId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new HttpError(404, 'Conversation not found'));
    }

    const conversation = await Conversation.findOne({
      _id: new mongoose.Types.ObjectId(id),
      organizationId: new mongoose.Types.ObjectId(organizationId),
      userId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    }).lean();

    if (!conversation) {
      return next(new HttpError(404, 'Conversation not found'));
    }

    const messages: StoredMessage[] = conversation.messages.map(m => ({
      id: (m._id as mongoose.Types.ObjectId).toString(),
      question: m.question,
      answer: m.answer,
      sources: m.sources,
      chunks: m.chunks.map(ch => ({
        documentId: ch.documentId,
        content: ch.content,
        score: ch.score,
      })),
      mode: m.mode,
      ...(m.documentId ? { documentId: String(m.documentId) } : {}),
      ...(m.documentName ? { documentName: m.documentName } : {}),
      timestamp: m.timestamp.toISOString(),
    }));

    const detail: ConversationDetail = {
      ...toSummary({
        _id: conversation._id as mongoose.Types.ObjectId,
        title: conversation.title,
        mode: conversation.mode,
        documentId: conversation.documentId as mongoose.Types.ObjectId | null,
        documentName: conversation.documentName,
        messageCount: conversation.messageCount,
        lastActivity: conversation.lastActivity,
        createdAt: conversation.createdAt,
      }),
      messages,
      organizationId: conversation.organizationId.toString(),
      userId: conversation.userId.toString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };

    res.json({ success: true, data: { conversation: detail } });
  } catch (err: unknown) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/ai/conversations/:id
// ---------------------------------------------------------------------------

export async function updateConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organization!._id.toString();
    const userId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new HttpError(404, 'Conversation not found'));
    }

    const body = req.body as Record<string, unknown>;
    const title = body.title;

    if (typeof title !== 'string' || title.trim().length === 0) {
      return next(new HttpError(400, 'title is required'));
    }

    if (title.length > 120) {
      return next(new HttpError(400, 'title must be 120 characters or fewer'));
    }

    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        organizationId: new mongoose.Types.ObjectId(organizationId),
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      },
      { $set: { title: title.trim() } },
      { new: true }
    ).lean();

    if (!conversation) {
      return next(new HttpError(404, 'Conversation not found'));
    }

    res.json({
      success: true,
      data: {
        conversation: toSummary({
          _id: conversation._id as mongoose.Types.ObjectId,
          title: conversation.title,
          mode: conversation.mode,
          documentId: conversation.documentId as mongoose.Types.ObjectId | null,
          documentName: conversation.documentName,
          messageCount: conversation.messageCount,
          lastActivity: conversation.lastActivity,
          createdAt: conversation.createdAt,
        }),
      },
    });
  } catch (err: unknown) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/ai/conversations/:id  (soft delete)
// ---------------------------------------------------------------------------

export async function deleteConversation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organization!._id.toString();
    const userId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new HttpError(404, 'Conversation not found'));
    }

    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        organizationId: new mongoose.Types.ObjectId(organizationId),
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      { new: true }
    ).lean();

    if (!conversation) {
      return next(new HttpError(404, 'Conversation not found'));
    }

    res.json({ success: true, data: { deletedId: id } });
  } catch (err: unknown) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/conversations/:id/messages
// ---------------------------------------------------------------------------

interface AddMessageBody {
  question?: unknown;
  answer?: unknown;
  sources?: unknown;
  chunks?: unknown;
  mode?: unknown;
  documentId?: unknown;
  documentName?: unknown;
  timestamp?: unknown;
}

interface RawChunk {
  documentId?: unknown;
  content?: unknown;
  score?: unknown;
}

function isRawChunk(value: unknown): value is RawChunk {
  return typeof value === 'object' && value !== null;
}

export async function addMessage(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const organizationId = req.organization!._id.toString();
    const userId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new HttpError(404, 'Conversation not found'));
    }

    const body = req.body as AddMessageBody;

    const question = body.question;
    const answer = body.answer;

    if (typeof question !== 'string' || question.trim().length === 0) {
      return next(new HttpError(400, 'question is required'));
    }

    if (typeof answer !== 'string' || answer.trim().length === 0) {
      return next(new HttpError(400, 'answer is required'));
    }

    const mode = body.mode;
    if (mode !== 'org' && mode !== 'document') {
      return next(new HttpError(400, 'mode must be "org" or "document"'));
    }

    const rawSources = body.sources;
    const sources: string[] = Array.isArray(rawSources)
      ? rawSources.filter((s): s is string => typeof s === 'string')
      : [];

    const rawChunks = body.chunks;
    const chunks: Array<{ documentId: string; content: string; score: number }> = [];

    if (Array.isArray(rawChunks)) {
      for (const item of rawChunks) {
        if (!isRawChunk(item)) continue;
        if (
          typeof item.documentId === 'string' &&
          typeof item.content === 'string' &&
          typeof item.score === 'number'
        ) {
          chunks.push({ documentId: item.documentId, content: item.content, score: item.score });
        }
      }
    }

    const rawTimestamp = body.timestamp;
    const timestamp =
      typeof rawTimestamp === 'string' && !isNaN(Date.parse(rawTimestamp))
        ? new Date(rawTimestamp)
        : new Date();

    const documentId =
      typeof body.documentId === 'string' ? body.documentId : null;
    const documentName =
      typeof body.documentName === 'string' ? body.documentName : null;

    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        organizationId: new mongoose.Types.ObjectId(organizationId),
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      },
      {
        $push: {
          messages: {
            question: question.trim(),
            answer: answer.trim(),
            sources,
            chunks,
            mode,
            documentId,
            documentName,
            timestamp,
          },
        },
        $inc: { messageCount: 1 },
        $set: { lastActivity: timestamp },
      },
      { new: true }
    ).lean();

    if (!conversation) {
      return next(new HttpError(404, 'Conversation not found'));
    }

    const lastMessage = conversation.messages[conversation.messages.length - 1];

    const storedMessage: StoredMessage = {
      id: (lastMessage._id as mongoose.Types.ObjectId).toString(),
      question: lastMessage.question,
      answer: lastMessage.answer,
      sources: lastMessage.sources,
      chunks: lastMessage.chunks.map(ch => ({
        documentId: ch.documentId,
        content: ch.content,
        score: ch.score,
      })),
      mode: lastMessage.mode,
      ...(lastMessage.documentId ? { documentId: String(lastMessage.documentId) } : {}),
      ...(lastMessage.documentName ? { documentName: lastMessage.documentName } : {}),
      timestamp: lastMessage.timestamp.toISOString(),
    };

    res.status(201).json({
      success: true,
      data: { message: storedMessage, messageCount: conversation.messageCount },
    });
  } catch (err: unknown) {
    next(err);
  }
}

import { request, app } from '../setup';
import type { Response } from 'supertest';
import { registerAndLogin, getAuthCookie, bodyOf } from '../helpers';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Types for response shapes
// ---------------------------------------------------------------------------

interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  documentId?: string;
  documentName?: string;
  messageCount: number;
  lastActivity: string;
  createdAt: string;
}

interface StoredMessage {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  chunks: Array<{ documentId: string; content: string; score: number }>;
  mode: string;
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

type ApiBody<T = unknown> = { success?: boolean; data?: T; error?: string };

function body<T = unknown>(res: Response): ApiBody<T> {
  return bodyOf<ApiBody<T>>(res);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = '/api/ai/conversations';

async function authSetup() {
  const auth = await registerAndLogin();
  const cookieHeader = getAuthCookie(auth.cookies);
  return { cookieHeader, auth };
}

async function createConv(
  cookieHeader: string,
  payload: Record<string, unknown> = {}
): Promise<Response> {
  return request(app)
    .post(BASE)
    .set('Cookie', cookieHeader)
    .send({ title: 'Test Conversation', mode: 'org', ...payload });
}

async function addMsg(
  cookieHeader: string,
  convId: string,
  payload: Record<string, unknown> = {}
): Promise<Response> {
  return request(app)
    .post(`${BASE}/${convId}/messages`)
    .set('Cookie', cookieHeader)
    .send({
      question: 'What is CloudDocs?',
      answer: 'CloudDocs is a document management platform.',
      sources: [],
      chunks: [],
      mode: 'org',
      timestamp: new Date().toISOString(),
      ...payload,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AI Conversations Endpoints', () => {
  // -------------------------------------------------------------------------
  // POST /api/ai/conversations — create
  // -------------------------------------------------------------------------

  describe('POST /api/ai/conversations', () => {
    it('should create an org conversation', async () => {
      const { cookieHeader } = await authSetup();

      const res = await createConv(cookieHeader);

      expect(res.status).toBe(201);
      const data = body<{ conversation: ConversationSummary }>(res as Response);
      expect(data.success).toBe(true);
      const conv = data.data?.conversation;
      expect(conv).toBeDefined();
      expect(conv?.title).toBe('Test Conversation');
      expect(conv?.mode).toBe('org');
      expect(conv?.messageCount).toBe(0);
      expect(conv?.id).toBeDefined();
    });

    it('should create a document conversation with documentId', async () => {
      const { cookieHeader } = await authSetup();
      const fakeDocId = new mongoose.Types.ObjectId().toString();

      const res = await createConv(cookieHeader, {
        title: 'Doc Conversation',
        mode: 'document',
        documentId: fakeDocId,
        documentName: 'my-report.pdf',
      });

      expect(res.status).toBe(201);
      const data = body<{ conversation: ConversationSummary }>(res as Response);
      const conv = data.data?.conversation;
      expect(conv?.mode).toBe('document');
      expect(conv?.documentId).toBe(fakeDocId);
      expect(conv?.documentName).toBe('my-report.pdf');
    });

    it('should return 400 when title is missing', async () => {
      const { cookieHeader } = await authSetup();

      const res = await request(app)
        .post(BASE)
        .set('Cookie', cookieHeader)
        .send({ mode: 'org' });

      expect(res.status).toBe(400);
      expect(body(res as Response).success).toBe(false);
    });

    it('should return 400 when title exceeds 120 characters', async () => {
      const { cookieHeader } = await authSetup();

      const res = await createConv(cookieHeader, { title: 'a'.repeat(121) });

      expect(res.status).toBe(400);
    });

    it('should return 400 when mode is invalid', async () => {
      const { cookieHeader } = await authSetup();

      const res = await createConv(cookieHeader, { mode: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when mode is document but documentId is missing', async () => {
      const { cookieHeader } = await authSetup();

      const res = await createConv(cookieHeader, { mode: 'document' });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post(BASE)
        .send({ title: 'Test', mode: 'org' });

      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/ai/conversations — list
  // -------------------------------------------------------------------------

  describe('GET /api/ai/conversations', () => {
    it('should return empty list initially', async () => {
      const { cookieHeader } = await authSetup();

      const res = await request(app).get(BASE).set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      const data = body<{ conversations: ConversationSummary[]; total: number }>(res as Response);
      expect(data.success).toBe(true);
      expect(data.data?.conversations).toEqual([]);
      expect(data.data?.total).toBe(0);
    });

    it('should list conversations sorted by lastActivity descending', async () => {
      const { cookieHeader } = await authSetup();

      await createConv(cookieHeader, { title: 'First' });
      await createConv(cookieHeader, { title: 'Second' });

      const res = await request(app).get(BASE).set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      const data = body<{ conversations: ConversationSummary[]; total: number }>(res as Response);
      expect(data.data?.total).toBe(2);
      expect(data.data?.conversations).toHaveLength(2);
    });

    it('should not return messages in the list endpoint', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = (body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id) as string;

      await addMsg(cookieHeader, convId);

      const res = await request(app).get(BASE).set('Cookie', cookieHeader);
      const conversations = body<{ conversations: ConversationSummary[] }>(res as Response).data?.conversations ?? [];

      for (const conv of conversations) {
        expect(Object.prototype.hasOwnProperty.call(conv, 'messages')).toBe(false);
      }
    });

    it('should filter by mode', async () => {
      const { cookieHeader } = await authSetup();
      const fakeDocId = new mongoose.Types.ObjectId().toString();

      await createConv(cookieHeader, { title: 'Org Conv', mode: 'org' });
      await createConv(cookieHeader, { title: 'Doc Conv', mode: 'document', documentId: fakeDocId });

      const res = await request(app).get(`${BASE}?mode=org`).set('Cookie', cookieHeader);

      const data = body<{ conversations: ConversationSummary[] }>(res as Response);
      expect(data.data?.conversations.every(c => c.mode === 'org')).toBe(true);
    });

    it('should respect pagination params', async () => {
      const { cookieHeader } = await authSetup();

      await Promise.all([
        createConv(cookieHeader, { title: 'A' }),
        createConv(cookieHeader, { title: 'B' }),
        createConv(cookieHeader, { title: 'C' }),
      ]);

      const res = await request(app)
        .get(`${BASE}?page=1&limit=2`)
        .set('Cookie', cookieHeader);

      const data = body<{ conversations: ConversationSummary[]; total: number; page: number; limit: number }>(res as Response);
      expect(data.data?.conversations).toHaveLength(2);
      expect(data.data?.total).toBe(3);
      expect(data.data?.limit).toBe(2);
    });

    it('should cap limit at 50', async () => {
      const { cookieHeader } = await authSetup();

      const res = await request(app)
        .get(`${BASE}?limit=200`)
        .set('Cookie', cookieHeader);

      const data = body<{ limit: number }>(res as Response);
      expect(data.data?.limit).toBe(50);
    });

    it('should not return other users conversations', async () => {
      const { cookieHeader: cookie1 } = await authSetup();
      const { cookieHeader: cookie2 } = await authSetup();

      await createConv(cookie1, { title: 'User1 Conv' });

      const res = await request(app).get(BASE).set('Cookie', cookie2);
      const data = body<{ conversations: ConversationSummary[] }>(res as Response);
      expect(data.data?.conversations).toEqual([]);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get(BASE);
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/ai/conversations/:id — detail
  // -------------------------------------------------------------------------

  describe('GET /api/ai/conversations/:id', () => {
    it('should return conversation detail with messages', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      await addMsg(cookieHeader, convId);

      const res = await request(app)
        .get(`${BASE}/${convId}`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      const data = body<{ conversation: ConversationDetail }>(res as Response);
      const conv = data.data?.conversation;
      expect(conv?.id).toBe(convId);
      expect(conv?.messages).toHaveLength(1);
      expect(conv?.messages[0].question).toBe('What is CloudDocs?');
      expect(conv?.organizationId).toBeDefined();
      expect(conv?.userId).toBeDefined();
    });

    it('should return 404 for non-existent conversation', async () => {
      const { cookieHeader } = await authSetup();
      const fakeId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .get(`${BASE}/${fakeId}`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(404);
    });

    it('should return 404 for another users conversation', async () => {
      const { cookieHeader: cookie1 } = await authSetup();
      const { cookieHeader: cookie2 } = await authSetup();

      const convRes = await createConv(cookie1);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await request(app)
        .get(`${BASE}/${convId}`)
        .set('Cookie', cookie2);

      expect(res.status).toBe(404);
    });

    it('should return 404 for a deleted conversation', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      await request(app).delete(`${BASE}/${convId}`).set('Cookie', cookieHeader);

      const res = await request(app).get(`${BASE}/${convId}`).set('Cookie', cookieHeader);
      expect(res.status).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).get(`${BASE}/${fakeId}`);
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/ai/conversations/:id — update title
  // -------------------------------------------------------------------------

  describe('PATCH /api/ai/conversations/:id', () => {
    it('should update the conversation title', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await request(app)
        .patch(`${BASE}/${convId}`)
        .set('Cookie', cookieHeader)
        .send({ title: 'Updated Title' });

      expect(res.status).toBe(200);
      const data = body<{ conversation: ConversationSummary }>(res as Response);
      expect(data.data?.conversation?.title).toBe('Updated Title');
    });

    it('should return 400 when title is missing', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await request(app)
        .patch(`${BASE}/${convId}`)
        .set('Cookie', cookieHeader)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 for another users conversation', async () => {
      const { cookieHeader: cookie1 } = await authSetup();
      const { cookieHeader: cookie2 } = await authSetup();

      const convRes = await createConv(cookie1);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await request(app)
        .patch(`${BASE}/${convId}`)
        .set('Cookie', cookie2)
        .send({ title: 'Stolen Title' });

      expect(res.status).toBe(404);
    });

    it('should return 404 for a deleted conversation', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      await request(app).delete(`${BASE}/${convId}`).set('Cookie', cookieHeader);

      const res = await request(app)
        .patch(`${BASE}/${convId}`)
        .set('Cookie', cookieHeader)
        .send({ title: 'Ghost Title' });

      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/ai/conversations/:id — soft delete
  // -------------------------------------------------------------------------

  describe('DELETE /api/ai/conversations/:id', () => {
    it('should soft-delete the conversation', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await request(app)
        .delete(`${BASE}/${convId}`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      const data = body<{ deletedId: string }>(res as Response);
      expect(data.data?.deletedId).toBe(convId);
    });

    it('should not appear in list after deletion', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      await request(app).delete(`${BASE}/${convId}`).set('Cookie', cookieHeader);

      const listRes = await request(app).get(BASE).set('Cookie', cookieHeader);
      const data = body<{ conversations: ConversationSummary[]; total: number }>(listRes as Response);
      expect(data.data?.total).toBe(0);
    });

    it('should return 404 for non-existent conversation', async () => {
      const { cookieHeader } = await authSetup();
      const fakeId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .delete(`${BASE}/${fakeId}`)
        .set('Cookie', cookieHeader);

      expect(res.status).toBe(404);
    });

    it('should return 404 when deleting another users conversation', async () => {
      const { cookieHeader: cookie1 } = await authSetup();
      const { cookieHeader: cookie2 } = await authSetup();

      const convRes = await createConv(cookie1);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await request(app)
        .delete(`${BASE}/${convId}`)
        .set('Cookie', cookie2);

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app).delete(`${BASE}/${fakeId}`);
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/ai/conversations/:id/messages — add message
  // -------------------------------------------------------------------------

  describe('POST /api/ai/conversations/:id/messages', () => {
    it('should add a message and increment messageCount', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await addMsg(cookieHeader, convId);

      expect(res.status).toBe(201);
      const data = body<{ message: StoredMessage; messageCount: number }>(res as Response);
      expect(data.success).toBe(true);
      expect(data.data?.messageCount).toBe(1);

      const msg = data.data?.message;
      expect(msg).toBeDefined();
      expect(msg?.question).toBe('What is CloudDocs?');
      expect(msg?.answer).toBe('CloudDocs is a document management platform.');
      expect(msg?.id).toBeDefined();
      expect(msg?.mode).toBe('org');
    });

    it('should accumulate multiple messages', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      await addMsg(cookieHeader, convId);
      const res = await addMsg(cookieHeader, convId, { question: 'Second question?', answer: 'Second answer.' });

      expect(res.status).toBe(201);
      const data = body<{ messageCount: number }>(res as Response);
      expect(data.data?.messageCount).toBe(2);
    });

    it('should store sources and chunks', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const docId = new mongoose.Types.ObjectId().toString();
      const res = await addMsg(cookieHeader, convId, {
        sources: [docId],
        chunks: [{ documentId: docId, content: 'Some relevant text', score: 0.92 }],
      });

      const data = body<{ message: StoredMessage }>(res as Response);
      expect(data.data?.message.sources).toEqual([docId]);
      expect(data.data?.message.chunks[0].score).toBe(0.92);
    });

    it('should return 400 when question is missing', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await request(app)
        .post(`${BASE}/${convId}/messages`)
        .set('Cookie', cookieHeader)
        .send({ answer: 'An answer', sources: [], chunks: [], mode: 'org', timestamp: new Date().toISOString() });

      expect(res.status).toBe(400);
    });

    it('should return 400 when answer is missing', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await request(app)
        .post(`${BASE}/${convId}/messages`)
        .set('Cookie', cookieHeader)
        .send({ question: 'A question?', sources: [], chunks: [], mode: 'org', timestamp: new Date().toISOString() });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent conversation', async () => {
      const { cookieHeader } = await authSetup();
      const fakeId = new mongoose.Types.ObjectId().toString();

      const res = await addMsg(cookieHeader, fakeId);

      expect(res.status).toBe(404);
    });

    it('should return 404 for another users conversation', async () => {
      const { cookieHeader: cookie1 } = await authSetup();
      const { cookieHeader: cookie2 } = await authSetup();

      const convRes = await createConv(cookie1);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      const res = await addMsg(cookie2, convId);
      expect(res.status).toBe(404);
    });

    it('should return 404 for a deleted conversation', async () => {
      const { cookieHeader } = await authSetup();
      const convRes = await createConv(cookieHeader);
      const convId = body<{ conversation: ConversationSummary }>(convRes as Response).data?.conversation?.id as string;

      await request(app).delete(`${BASE}/${convId}`).set('Cookie', cookieHeader);

      const res = await addMsg(cookieHeader, convId);
      expect(res.status).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post(`${BASE}/${fakeId}/messages`)
        .send({ question: 'Q', answer: 'A', mode: 'org', sources: [], chunks: [], timestamp: new Date().toISOString() });

      expect(res.status).toBe(401);
    });
  });
});

import express from 'express';
import { requireActiveOrganization } from '../middlewares/organization.middleware';
import * as aiConversationsController from '../controllers/aiConversations.controller';

const router = express.Router();

/**
 * All routes require an active organization context.
 * The JWT auth middleware is applied at the app level before this router is mounted.
 */
router.use(requireActiveOrganization);

/**
 * @route   GET /api/ai/conversations
 * @desc    List user's conversations (paginated, summary only)
 * @access  Authenticated users with an active organization
 * @query   { page?, limit?, mode? }
 * @returns { success: true, data: { conversations, total, page, limit } }
 */
router.get('/', aiConversationsController.listConversations);

/**
 * @route   POST /api/ai/conversations
 * @desc    Create a new conversation
 * @access  Authenticated users with an active organization
 * @body    { title, mode, documentId?, documentName? }
 * @returns 201 { success: true, data: { conversation: ConversationSummary } }
 */
router.post('/', aiConversationsController.createConversation);

/**
 * @route   GET /api/ai/conversations/:id
 * @desc    Get a single conversation with full message history
 * @access  Authenticated users with an active organization (owner only)
 * @params  id - Conversation ObjectId
 * @returns { success: true, data: { conversation: ConversationDetail } }
 */
router.get('/:id', aiConversationsController.getConversation);

/**
 * @route   PATCH /api/ai/conversations/:id
 * @desc    Update conversation title
 * @access  Authenticated users with an active organization (owner only)
 * @body    { title }
 * @returns { success: true, data: { conversation: ConversationSummary } }
 */
router.patch('/:id', aiConversationsController.updateConversation);

/**
 * @route   DELETE /api/ai/conversations/:id
 * @desc    Soft-delete a conversation
 * @access  Authenticated users with an active organization (owner only)
 * @params  id - Conversation ObjectId
 * @returns { success: true, data: { deletedId: string } }
 */
router.delete('/:id', aiConversationsController.deleteConversation);

/**
 * @route   POST /api/ai/conversations/:id/messages
 * @desc    Append a new question+answer message to a conversation
 * @access  Authenticated users with an active organization (owner only)
 * @body    { question, answer, sources, chunks, mode, documentId?, documentName?, timestamp }
 * @returns 201 { success: true, data: { message: StoredMessage, messageCount: number } }
 */
router.post('/:id/messages', aiConversationsController.addMessage);

export default router;

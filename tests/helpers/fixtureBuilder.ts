import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';

export function ensureDirs() {
  const storageBase = path.join(process.cwd(), 'storage');
  const fixturesBase = path.join(process.cwd(), 'tests', 'fixtures', 'test-files');
  if (!fs.existsSync(storageBase)) fs.mkdirSync(storageBase, { recursive: true });
  if (!fs.existsSync(fixturesBase)) fs.mkdirSync(fixturesBase, { recursive: true });
}

export function writeTestFile(
  options: {
    organization?: string;
    filename?: string;
    content?: Buffer | string;
    mode?: number;
  } = {}
) {
  ensureDirs();
  const {
    organization = `test-org-${Date.now()}`,
    filename,
    content = Buffer.from('fixture'),
    mode = 0o644
  } = options;
  const name = filename || `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.bin`;
  const storageDir = path.join(process.cwd(), 'storage', organization);
  if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
  const filePath = path.join(storageDir, name);
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  fs.writeFileSync(filePath, buffer, { mode });

  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures', 'test-files');
  const fixturePath = path.join(fixturesDir, name);
  fs.writeFileSync(fixturePath, buffer, { mode });

  return {
    filename: name,
    path: filePath,
    fixturePath,
    size: buffer.length,
    organization
  };
}

export function buildDocumentObject(overrides: any = {}) {
  const id = overrides._id || new mongoose.Types.ObjectId();
  const org = overrides.organization || `test-org-${Date.now()}`;
  const file = overrides.path
    ? {
        path: overrides.path,
        filename: overrides.filename || path.basename(overrides.path),
        size: overrides.size || 0
      }
    : writeTestFile({
        organization: org,
        filename: overrides.filename,
        content: overrides.content
      });

  return {
    _id: id,
    filename: overrides.filename || file.filename,
    path: file.path,
    mimeType: overrides.mimeType || 'application/octet-stream',
    size: file.size,
    uploadedBy: overrides.uploadedBy || new mongoose.Types.ObjectId(),
    organization: org,
    folder: overrides.folder || null,
    createdAt: overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || new Date(),
    ...overrides
  };
}

export async function attachExtractedTextToModel(DocumentModel: any, docId: any, text: string) {
  if (!DocumentModel) throw new Error('DocumentModel is required');
  const update: any = {
    extractedText: text,
    aiProcessingStatus: 'completed',
    aiProcessedAt: new Date()
  };
  return DocumentModel.findByIdAndUpdate(docId, update, { new: true }).exec();
}

export async function createDocumentWithExtractedText(
  DocumentModel: any,
  opts: any = {},
  extractedText: string = ''
) {
  if (!DocumentModel) throw new Error('DocumentModel is required');
  const file = writeTestFile({
    organization: opts.organization,
    filename: opts.filename,
    content: opts.content || 'builder-content'
  });
  const doc = buildDocumentObject({
    ...opts,
    path: file.path,
    filename: file.filename,
    size: file.size,
    extractedText
  });
  const created = await DocumentModel.create(doc);
  if (extractedText && extractedText.length > 0) {
    await DocumentModel.findByIdAndUpdate(created._id, {
      aiProcessingStatus: 'completed',
      aiProcessedAt: new Date()
    }).exec();
  }
  return created;
}

export async function setAiMetadata(DocumentModel: any, docId: any, metadata: any = {}) {
  if (!DocumentModel) throw new Error('DocumentModel is required');
  const allowed = [
    'aiCategory',
    'aiConfidence',
    'aiTags',
    'aiSummary',
    'aiKeyPoints',
    'aiProcessingStatus',
    'aiError'
  ];
  const update: any = {};
  for (const k of Object.keys(metadata)) {
    if (allowed.includes(k)) update[k] = metadata[k];
  }
  update.aiProcessedAt = metadata.aiProcessedAt || new Date();
  return DocumentModel.findByIdAndUpdate(docId, update, { new: true }).exec();
}

/**
 * Create a synthetic OCR output file next to the original file (used by OCR fallbacks/mocks)
 */
export function writeOcrOutput(filePath: string, text: string) {
  if (!filePath) throw new Error('filePath required');
  const ocrPath = `${filePath}.ocr.txt`;
  fs.writeFileSync(ocrPath, text || '', { mode: 0o644 });
  return ocrPath;
}

/**
 * Write a fake embeddings JSON file for a document (used by tests mocking embedding store)
 */
export function writeEmbeddingFixture(
  filePath: string,
  vectors: number[] | number[][],
  meta: any = {}
) {
  const base = path.dirname(filePath);
  const name = `${path.basename(filePath)}.emb.json`;
  const out = path.join(base, name);
  const payload = { vectors, meta };
  fs.writeFileSync(out, JSON.stringify(payload), { mode: 0o644 });
  return out;
}

export default {
  ensureDirs,
  writeTestFile,
  buildDocumentObject,
  attachExtractedTextToModel,
  createDocumentWithExtractedText,
  setAiMetadata,
  writeOcrOutput,
  writeEmbeddingFixture
};

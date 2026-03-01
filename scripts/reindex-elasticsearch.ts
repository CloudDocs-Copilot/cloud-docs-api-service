/**
 * Script: reindex-elasticsearch.ts
 *
 * Re-indexes ALL non-deleted documents from MongoDB into Elasticsearch.
 * Also updates the index mapping to ensure `sharedWith` and any new fields exist.
 *
 * Usage:
 *   npx ts-node scripts/reindex-elasticsearch.ts
 *
 * Options (env vars):
 *   BATCH_SIZE   - Documents per batch (default: 50)
 *   DRY_RUN      - Set to "true" to skip actual ES writes (default: false)
 */

import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { Client } from '@elastic/elasticsearch';

const MONGO_URI = process.env.MONGO_URI || '';
const ES_NODE = process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10);
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!MONGO_URI) {
  console.error('MONGO_URI not set in environment');
  process.exit(1);
}

const esClient = new Client({
  node: ES_NODE,
  auth:
    process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD
      ? {
          username: process.env.ELASTICSEARCH_USERNAME,
          password: process.env.ELASTICSEARCH_PASSWORD
        }
      : undefined
});

async function ensureMapping(): Promise<void> {
  console.log('Updating Elasticsearch mapping...');
  await esClient.indices.putMapping({
    index: 'documents',
    properties: {
      filename: {
        type: 'text',
        analyzer: 'custom_analyzer',
        fields: { keyword: { type: 'keyword' } }
      },
      originalname: { type: 'text', analyzer: 'custom_analyzer' },
      content: { type: 'text', analyzer: 'custom_analyzer' },
      extractedContent: { type: 'text' },
      mimeType: { type: 'keyword' },
      size: { type: 'long' },
      uploadedBy: { type: 'keyword' },
      organization: { type: 'keyword' },
      folder: { type: 'keyword' },
      uploadedAt: { type: 'date' },
      sharedWith: { type: 'keyword' },
      aiCategory: { type: 'keyword' },
      aiTags: { type: 'keyword' },
      aiSummary: { type: 'text' },
      aiKeyPoints: { type: 'text' },
      aiProcessingStatus: {
        type: 'text',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } }
      },
      aiConfidence: { type: 'float' }
    }
  } as Parameters<typeof esClient.indices.putMapping>[0]);
  console.log('Mapping updated');
}

interface MongoDocument {
  _id: ObjectId;
  filename?: string;
  originalname?: string;
  extractedContent?: string;
  mimeType?: string;
  size?: number;
  uploadedBy?: ObjectId;
  organization?: ObjectId;
  folder?: ObjectId;
  uploadedAt?: Date;
  createdAt?: Date;
  sharedWith?: ObjectId[];
  aiCategory?: string | null;
  aiTags?: string[];
  aiSummary?: string | null;
  aiKeyPoints?: string[];
  aiProcessingStatus?: string;
  aiConfidence?: number | null;
  deletedAt?: Date | null;
}

async function reindex(): Promise<void> {
  console.log(`Starting reindex - ES: ${ES_NODE} | Batch: ${BATCH_SIZE}${DRY_RUN ? ' | DRY RUN' : ''}`);
  console.log(`MongoDB: ${MONGO_URI.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')}`);

  const mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  console.log('MongoDB connected');

  const dbName = MONGO_URI.split('/').pop()?.split('?')[0] || 'clouddocs';
  console.log(`Using database: ${dbName}`);
  const db = mongoClient.db(dbName);
  const collection = db.collection('documents');

  const totalAll = await collection.countDocuments({});
  const total = await collection.countDocuments({ deletedAt: null });
  console.log(`Active documents (deletedAt = null): ${total}`);
  console.log(`Total documents (no filter): ${totalAll}`);

  if (total === 0 && totalAll === 0) {
    console.log('No documents found. Exiting.');
    await mongoClient.close();
    return;
  }

  await ensureMapping();

  let indexed = 0;
  let failed = 0;
  let skip = 0;
  const query = totalAll > 0 && total === 0 ? {} : { deletedAt: null };
  const docCount = totalAll > 0 && total === 0 ? totalAll : total;

  console.log(`Indexing ${docCount} documents...`);

  while (skip < docCount) {
    const docs = await collection
      .find<MongoDocument>(query)
      .skip(skip)
      .limit(BATCH_SIZE)
      .toArray();

    if (docs.length === 0) break;

    const operations: object[] = [];

    for (const doc of docs) {
      operations.push(
        { index: { _index: 'documents', _id: String(doc._id) } },
        {
          filename: doc.filename || '',
          originalname: doc.originalname || '',
          extractedContent: doc.extractedContent || '',
          mimeType: doc.mimeType,
          size: doc.size,
          uploadedBy: doc.uploadedBy ? String(doc.uploadedBy) : null,
          organization: doc.organization ? String(doc.organization) : null,
          folder: doc.folder ? String(doc.folder) : null,
          uploadedAt: doc.uploadedAt || doc.createdAt,
          content: doc.extractedContent ? doc.extractedContent.slice(0, 100000) : null,
          sharedWith: (doc.sharedWith || []).map((id) => String(id)),
          aiCategory: doc.aiCategory || null,
          aiTags: doc.aiTags || [],
          aiSummary: doc.aiSummary || null,
          aiKeyPoints: doc.aiKeyPoints || [],
          aiProcessingStatus: doc.aiProcessingStatus || 'none',
          aiConfidence: doc.aiConfidence || null
        }
      );
    }

    if (!DRY_RUN && operations.length > 0) {
      const { errors, items } = await esClient.bulk({ operations });

      if (errors) {
        for (const item of items) {
          const action = item.index;
          if (action?.error) {
            console.warn(`Failed to index ${action._id}: ${JSON.stringify(action.error)}`);
            failed++;
          } else {
            indexed++;
          }
        }
      } else {
        indexed += docs.length;
      }
    } else {
      indexed += docs.length;
    }

    skip += docs.length;
    console.log(`Progress: ${skip}/${docCount} - OK: ${indexed}, Failed: ${failed}`);
  }

  console.log(`\nReindex complete - ${indexed} indexed${DRY_RUN ? ' (dry run)' : ''}, ${failed} failed`);

  await mongoClient.close();
  process.exit(0);
}

reindex().catch((err: unknown) => {
  console.error('Reindex failed:', err);
  process.exit(1);
});

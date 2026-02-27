import { writeTestFile, buildDocumentObject } from '../helpers/fixtureBuilder';
// import type { BuiltDocument } from '../helpers/fixtureBuilder';
import path from 'path';
import fs from 'fs';

// Define a local type for the builder payload (replace with actual structure if needed)
type BuiltDocumentLike = DocumentData & { content?: string | Buffer };

import mongoose from 'mongoose';

interface DocumentData {
  filename: string;
  content?: string;
  mimeType: string;
  size?: number;
  organization?: string | null;
  path?: string;
  uploadedBy?: mongoose.Types.ObjectId | undefined;
  folder?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  [k: string]: unknown;
}

export async function createDocumentModel(
  DocumentModel: { create: (doc: unknown) => Promise<unknown> },
  opts: Partial<DocumentData & { organization?: string }> = {}
): Promise<unknown> {
  const file = writeTestFile({
    organization: opts.organization,
    filename: opts.filename,
    content: opts.content ?? 'builder-content'
  });

  // Type guard to ensure file is TestFileResult
  function isTestFileResult(obj: unknown): obj is import('../helpers/fixtureBuilder').TestFileResult {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'relativePath' in obj &&
      'filename' in obj &&
      'size' in obj
    );
  }
  if (!isTestFileResult(file)) {
    throw new Error('Failed to create test file: unexpected result type');
  }
  const fileResult = file;

  // Ensure uploadedBy is correct type
  const uploadedBy =
    opts.uploadedBy && opts.uploadedBy instanceof mongoose.Types.ObjectId
      ? opts.uploadedBy
      : undefined;

  const doc: BuiltDocumentLike = buildDocumentObject({
    ...opts,
    uploadedBy,
    path: fileResult.relativePath,
    filename: fileResult.filename,
    size: fileResult.size
  });

  return DocumentModel.create(doc as unknown);
}

export function documentPayload(opts: Partial<DocumentData> = {}): DocumentData {
  // Ensure organization is never null (only string or undefined)
  const safeOpts = { ...opts, organization: opts.organization === null ? undefined : opts.organization };
  const built = buildDocumentObject(
    safeOpts as Partial<Omit<BuiltDocumentLike, 'organization'>> & { organization?: string }
  );
  return built as DocumentData;
}

/**
 * Document Builder
 * Constructor de documentos de prueba con patrón builder
 */
export class DocumentBuilder {
  private documentData: DocumentData = {
    filename: 'default-file.txt',
    content: 'Default content',
    mimeType: 'text/plain'
  };

  withFilename(filename: string): DocumentBuilder {
    this.documentData.filename = filename;
    return this;
  }

  withContent(content: string): DocumentBuilder {
    this.documentData.content = content;
    return this;
  }

  withMimeType(mimeType: string): DocumentBuilder {
    this.documentData.mimeType = mimeType;
    return this;
  }

  withSize(size: number): DocumentBuilder {
    this.documentData.size = size;
    return this;
  }

  asPdf(): DocumentBuilder {
    this.documentData.filename = 'document.pdf';
    this.documentData.mimeType = 'application/pdf';
    this.documentData.content = 'PDF content simulation';
    return this;
  }

  asPng(): DocumentBuilder {
    this.documentData.filename = 'image.png';
    this.documentData.mimeType = 'image/png';
    this.documentData.content = 'PNG image content';
    return this;
  }

  asJpeg(): DocumentBuilder {
    this.documentData.filename = 'image.jpg';
    this.documentData.mimeType = 'image/jpeg';
    this.documentData.content = 'JPEG image content';
    return this;
  }

  asText(): DocumentBuilder {
    this.documentData.filename = 'document.txt';
    this.documentData.mimeType = 'text/plain';
    return this;
  }

  withMaliciousFilename(): DocumentBuilder {
    this.documentData.filename = '../../etc/passwd.txt';
    return this;
  }

  withDangerousExtension(): DocumentBuilder {
    this.documentData.filename = 'malware.exe';
    this.documentData.content = 'executable content';
    return this;
  }

  withLongFilename(length = 300): DocumentBuilder {
    this.documentData.filename = 'a'.repeat(length) + '.txt';
    return this;
  }

  createTempFile(directory = __dirname): string {
    const filePath = path.join(directory, this.documentData.filename);
    fs.writeFileSync(filePath, this.documentData.content ?? '');
    return filePath;
  }

  static deleteTempFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  build(): DocumentData {
    return { ...this.documentData };
  }

  buildBuffer(): Buffer {
    return Buffer.from(this.documentData.content ?? '');
  }

  static buildMany(count: number, prefix = 'file'): DocumentData[] {
    const documents: DocumentData[] = [];
    for (let i = 0; i < count; i++) {
      documents.push(
        new DocumentBuilder()
          .withFilename(`${prefix}-${i + 1}.txt`)
          .withContent(`Content for ${prefix} ${i + 1}`)
          .build()
      );
    }
    return documents;
  }
}

export const createDocument = (overrides?: Partial<DocumentData>): DocumentData => {
  const builder = new DocumentBuilder();

  if (overrides?.filename) builder.withFilename(overrides.filename);
  if (overrides?.content) builder.withContent(overrides.content);
  if (overrides?.mimeType) builder.withMimeType(overrides.mimeType);
  if (overrides?.size) builder.withSize(overrides.size);

  return builder.build();
};

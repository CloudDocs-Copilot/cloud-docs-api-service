import type { Request } from 'express';

jest.resetModules();

import { fileFilter, generateFilename } from '../../../src/middlewares/upload.middleware';

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer?: Buffer;
};

describe('upload.middleware', (): void => {
  it('fileFilter allows known mimetype', (done): void => {
    const file: MulterFile & { stream: NodeJS.ReadableStream } = {
      fieldname: 'file',
      originalname: 'test.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: 123,
      destination: '/tmp',
      filename: 'test.png',
      path: '/tmp/test.png',
      buffer: Buffer.from(''),
      stream: {} as NodeJS.ReadableStream,
    };
    const cb = (err: unknown, _ok?: boolean): void => {
      if (err) {
        fail(String(err));
        done();
        return;
      }
      expect(_ok).toBe(true);
      done();
    };
    fileFilter({} as unknown as Request, file, cb as unknown as Parameters<typeof fileFilter>[2]);
  });

  it('fileFilter rejects unknown mimetype', (done): void => {
    const file: MulterFile & { stream: NodeJS.ReadableStream } = {
      fieldname: 'file',
      originalname: 'evil.exe',
      encoding: '7bit',
      mimetype: 'application/x-evil',
      size: 123,
      destination: '/tmp',
      filename: 'evil.exe',
      path: '/tmp/evil.exe',
      buffer: Buffer.from(''),
      stream: {} as NodeJS.ReadableStream,
    };
    const cb = (err: unknown, _ok?: boolean): void => {
      expect(err).toBeDefined();
      if (err && typeof err === 'object' && ('statusCode' in err || 'status' in (err as unknown as { status?: number }))) {
        const e = err as { statusCode?: number; status?: number };
        expect(e.statusCode || e.status).toBe(400);
      }
      done();
    };
    fileFilter({} as unknown as Request, file, cb as unknown as Parameters<typeof fileFilter>[2]);
  });

  it('generateFilename returns safe name for valid originalname', (done): void => {
    const file: MulterFile & { stream: NodeJS.ReadableStream } = {
      fieldname: 'file',
      originalname: 'photo.JPG',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 123,
      destination: '/tmp',
      filename: 'photo.JPG',
      path: '/tmp/photo.JPG',
      buffer: Buffer.from(''),
      stream: {} as NodeJS.ReadableStream,
    };
    generateFilename(file, (err: unknown, name?: string): void => {
      if (err) {
        fail(String(err));
        done();
        return;
      }
      expect(typeof name).toBe('string');
      expect(name && name.length).toBeGreaterThan(0);
      // should include extension .jpg (lowercased)
      expect(name!.toLowerCase().endsWith('.jpg')).toBe(true);
      done();
    });
  });

  it('generateFilename errors on invalid extension', (done): void => {
    const file: MulterFile & { stream: NodeJS.ReadableStream } = {
      fieldname: 'file',
      originalname: 'badfile.!@#',
      encoding: '7bit',
      mimetype: 'application/octet-stream',
      size: 123,
      destination: '/tmp',
      filename: 'badfile.!@#',
      path: '/tmp/badfile.!@#',
      buffer: Buffer.from(''),
      stream: {} as NodeJS.ReadableStream,
    };
    generateFilename(file, (err: unknown, name?: string): void => {
      expect(err).toBeDefined();
      expect(name).toBe('');
      done();
    });
  });
});

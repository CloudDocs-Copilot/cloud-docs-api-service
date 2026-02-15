jest.resetModules();

const { fileFilter, generateFilename } = require('../../../src/middlewares/upload.middleware');

describe('upload.middleware', () => {
  it('fileFilter allows known mimetype', done => {
    const file = { mimetype: 'image/png' };
    const cb = (err: any, _ok?: boolean) => {
      expect(err).toBeNull();
      expect(_ok).toBe(true);
      done();
    };
    fileFilter({} as any, file as any, cb as any);
  });

  it('fileFilter rejects unknown mimetype', done => {
    const file = { mimetype: 'application/x-evil' };
    const cb = (err: any, _ok?: boolean) => {
      expect(err).toBeDefined();
      expect(err.statusCode || err.status).toBe(400);
      done();
    };
    fileFilter({} as any, file as any, cb as any);
  });

  it('generateFilename returns safe name for valid originalname', done => {
    const file = { originalname: 'photo.JPG' };
    generateFilename(file as any, (err: any, name?: string) => {
      expect(err).toBeNull();
      expect(typeof name).toBe('string');
      expect(name && name.length).toBeGreaterThan(0);
      // should include extension .jpg (lowercased)
      expect(name!.toLowerCase().endsWith('.jpg')).toBe(true);
      done();
    });
  });

  it('generateFilename errors on invalid extension', done => {
    const file = { originalname: 'badfile.!@#' };
    generateFilename(file as any, (err: any, name?: string) => {
      expect(err).toBeDefined();
      expect(name).toBe('');
      done();
    });
  });
});

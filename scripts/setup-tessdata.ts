/**
 * setup-tessdata.ts
 *
 * Downloads the Tesseract OCR language models (traineddata) needed for image
 * text extraction. Run once after cloning the repo (or when adding new langs):
 *
 *   npm run setup:tessdata
 *
 * Models are sourced from tesseract-ocr/tessdata_fast (compact, fast models).
 * Files are saved to ./tessdata/ which is excluded from git.
 */

import fs from 'fs';
import https from 'https';
import path from 'path';

const TESSDATA_DIR = path.join(process.cwd(), 'tessdata');
const BASE_URL =
  'https://github.com/tesseract-ocr/tessdata_fast/raw/main';

// Languages to download — must match OCR_LANGUAGES in .env (spa+eng by default)
const LANGUAGES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['eng', 'spa'];

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      const size = fs.statSync(dest).size;
      console.log(`  ✓  Already exists: ${path.basename(dest)} (${(size / 1024 / 1024).toFixed(1)} MB) — skipping`);
      resolve();
      return;
    }

    const file = fs.createWriteStream(dest);
    const request = (redirectUrl: string): void => {
      https.get(redirectUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // Follow redirect
          file.close();
          fs.unlinkSync(dest);
          request(res.headers.location as string);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode} for ${redirectUrl}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          const size = fs.statSync(dest).size;
          console.log(`  ✓  Downloaded: ${path.basename(dest)} (${(size / 1024 / 1024).toFixed(1)} MB)`);
          resolve();
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    };
    request(url);
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(TESSDATA_DIR)) {
    fs.mkdirSync(TESSDATA_DIR, { recursive: true });
    console.log(`Created: ${TESSDATA_DIR}`);
  }

  console.log(`\nDownloading Tesseract language models to: ${TESSDATA_DIR}`);
  console.log(`Languages: ${LANGUAGES.join(', ')}\n`);

  for (const lang of LANGUAGES) {
    const filename = `${lang}.traineddata`;
    const dest = path.join(TESSDATA_DIR, filename);
    const url = `${BASE_URL}/${filename}`;
    console.log(`→  ${lang}: ${url}`);
    await downloadFile(url, dest);
  }

  console.log('\n✅  Tessdata setup complete. OCR is ready to use.\n');
}

main().catch((err: unknown) => {
  console.error('❌  Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

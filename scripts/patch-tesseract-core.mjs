/**
 * patch-tesseract-core.mjs
 *
 * Patches tesseract.js-core/tesseract-core.js to fix WASM loading on Node.js v18+.
 *
 * Root cause: tesseract.js-core v2.x was compiled with Emscripten before Node.js
 * had a native fetch() API. The generated instantiateAsync() checks
 * `typeof fetch === "function"` to decide whether to use streaming WASM load, but
 * it does NOT check ENVIRONMENT_IS_NODE. In Node.js v18+, fetch is globally
 * available, so the code tries to fetch() a local file path → "fetch failed".
 *
 * Fix: add `&&!ENVIRONMENT_IS_NODE` to that condition so Node.js always uses
 * the fs.readFileSync (readBinary) path instead.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  'tesseract.js-core',
  'tesseract-core.js',
);

if (!fs.existsSync(targetFile)) {
  console.log('[patch-tesseract-core] File not found, skipping:', targetFile);
  process.exit(0);
}

const SENTINEL = '/* patched-node-fetch-fix */';
const ORIGINAL =
  'typeof fetch==="function"){fetch(wasmBinaryFile,{credentials:"same-origin"})';
const PATCHED =
  `typeof fetch==="function"&&!ENVIRONMENT_IS_NODE)${SENTINEL}{fetch(wasmBinaryFile,{credentials:"same-origin"})`;

let content = fs.readFileSync(targetFile, 'utf8');

if (content.includes(SENTINEL)) {
  console.log('[patch-tesseract-core] Already patched, skipping.');
  process.exit(0);
}

if (!content.includes(ORIGINAL)) {
  console.warn(
    '[patch-tesseract-core] WARNING: Expected pattern not found in tesseract-core.js.',
    'The patch may not be needed or the file has changed.',
  );
  process.exit(0);
}

content = content.replace(ORIGINAL, PATCHED);
fs.writeFileSync(targetFile, content, 'utf8');
console.log('[patch-tesseract-core] Successfully patched tesseract-core.js for Node.js v18+ fetch compatibility.');

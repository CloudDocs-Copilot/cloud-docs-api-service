/**
 * Test para verificar el tamaño del token CSRF generado
 * Ejecuta: npx ts-node test-csrf-size.ts
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';

const app = express();
app.use(cookieParser());

const csrfProtection = doubleCsrf({
  getSecret: () => 'test-secret-key-change-in-production',
  cookieName: 'psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: false,
    httpOnly: true
  },
  size: 64, // 64 bytes
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req) => {
    return req.ip || 'anonymous';
  }
});

const generateCsrfToken = csrfProtection.generateCsrfToken;

app.get('/test-csrf', (req, res) => {
  const token = generateCsrfToken(req, res);
  
  console.log('\n=== CSRF Token Size Analysis ===\n');
  console.log('Token value (first 50 chars):', token.substring(0, 50));
  console.log('Token value (last 50 chars):', token.substring(token.length - 50));
  console.log('\nToken length:', token.length, 'characters');

  // Analysis
  const expectedLength = Math.ceil((64 * 4) / 3);  // base64url encoding
  const tolerance = 5;

  if (token.length >= (expectedLength - tolerance) && token.length <= (expectedLength + tolerance)) {
    console.log('✅ Token length is CORRECT');
    console.log(`   Expected ~${expectedLength} chars for 64 bytes, got ${token.length}`);
  } else if (token.length > 100) {
    console.log('❌ Token is SUSPICIOUSLY LONG');
    console.log(`   Expected ~${expectedLength} chars, got ${token.length}`);
    console.log('   Possible issues:');
    console.log('   - Token is double-encoded');
    console.log('   - csrf-csrf library version mismatch');
    console.log('   - Size parameter is not 64 bytes');
  } else {
    console.log('⚠️  Token length is unexpected');
    console.log(`   Expected ~${expectedLength} chars, got ${token.length}`);
  }

  // Base64url encoding calculation
  const byteSize = Math.ceil((token.length * 3) / 4);
  console.log(`\nReverse calculation: ${token.length} chars = ~${byteSize} bytes`);

  console.log('\n=== Library Info ===');
  console.log('csrf-csrf integration test: OK');
  console.log('For 64-byte tokens, expect 86-88 characters');
  console.log('For 96-byte tokens, expect 128-129 characters');
  console.log('For 128-byte tokens, expect 171-172 characters');

  if (token.length === 128) {
    console.log('\n🔴 FOUND THE ISSUE!');
    console.log('Token is exactly 128 chars = 96 bytes');
    console.log('But configured for 64 bytes!');
    console.log('Check if size: 64 is being overridden somewhere');
  }

  console.log('\n');
  
  res.json({ token, length: token.length });
  server.close();
  process.exit(0);
});

const server = app.listen(3001, () => {
  console.log('Test server running on port 3001...');
  console.log('Making request to http://localhost:3001/test-csrf\n');
  
  // Make request after short delay
  setTimeout(() => {
    fetch('http://localhost:3001/test-csrf')
      .then(r => r.json())
      .catch(e => {
        console.error('Error:', e.message);
        server.close();
        process.exit(1);
      });
  }, 500);
});

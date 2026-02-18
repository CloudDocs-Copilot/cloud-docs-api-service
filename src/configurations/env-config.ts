import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Load environment variables from .env files
 *
 * Priority order (later files override earlier):
 * 1. .env.example (defaults/documentation)
 * 2. .env (base configuration)
 * 3. .env.local (local overrides, not committed)
 * 4. .env.{NODE_ENV} (environment-specific)
 * 5. .env.{NODE_ENV}.local (environment-specific local overrides)
 *
 * @param rootDir - Root directory containing .env files (defaults to process.cwd())
 */
export function loadEnv(rootDir: string = process.cwd()): void {
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Files to load in order (later overrides earlier)
  const envFiles = [
    '.env.example', // Defaults (lowest priority)
    '.env', // Base configuration
    '.env.local', // Local overrides
    `.env.${nodeEnv}`, // Environment-specific
    `.env.${nodeEnv}.local` // Environment-specific local overrides (highest priority)
  ];

  for (const file of envFiles) {
    const filePath = path.resolve(rootDir, file);

    if (fs.existsSync(filePath)) {
      const result = dotenv.config({ path: filePath, override: true });

      if (result.error) {
        console.warn(`⚠️  Warning: Could not load ${file}: ${result.error.message}`);
      } else if (process.env.NODE_ENV !== 'test') {
        console.log(`✅ Loaded environment from ${file}`);
      }
    }
  }
}

/**
 * Get required environment variable or throw error
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 */
export function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Get boolean environment variable
 */
export function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}

/**
 * Get number environment variable
 */
export function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Auto-load environment on import
loadEnv();

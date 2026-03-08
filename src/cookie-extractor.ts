import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserContext } from 'playwright';
import type Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PASSPHRASE_FILE = join(__dirname, '..', 'data', '.cookie-passphrase');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;

let cachedKey: Buffer | null = null;
let cachedSalt: Buffer | null = null;

/** Derive encryption key from passphrase */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH);
}

/** Get or create passphrase for cookie encryption */
function getPassphrase(): string {
  const envPass = process.env.COOKIE_PASSPHRASE;
  if (envPass) return envPass;

  if (existsSync(PASSPHRASE_FILE)) {
    return readFileSync(PASSPHRASE_FILE, 'utf-8').trim();
  }

  // Generate and store a random passphrase
  const passphrase = randomBytes(32).toString('hex');
  writeFileSync(PASSPHRASE_FILE, passphrase, { mode: 0o600 });
  return passphrase;
}

/** Get cached encryption key, deriving if needed */
function getEncryptionKey(): { key: Buffer; salt: Buffer } {
  if (cachedKey && cachedSalt) return { key: cachedKey, salt: cachedSalt };

  const passphrase = getPassphrase();
  cachedSalt = randomBytes(SALT_LENGTH);
  cachedKey = deriveKey(passphrase, cachedSalt);
  return { key: cachedKey, salt: cachedSalt };
}

/** Encrypt a cookie value with AES-256-GCM */
export function encryptValue(plaintext: string): string {
  const { key, salt } = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: salt:iv:tag:ciphertext (all hex)
  return [salt.toString('hex'), iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

/** Decrypt a cookie value */
export function decryptValue(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted format');

  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const ciphertext = Buffer.from(parts[3], 'hex');

  const passphrase = getPassphrase();
  const key = deriveKey(passphrase, salt);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf-8');
}

const INSERT_COOKIE_SQL = `INSERT INTO cookies
  (session_id, name, value, domain, path, expires, http_only, secure, same_site)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Extract and store cookies from a Playwright browser context */
export async function extractAndStoreCookies(
  context: BrowserContext,
  db: Database.Database,
  sessionId: number,
): Promise<number> {
  const cookies = await context.cookies();
  const stmt = db.prepare(INSERT_COOKIE_SQL);

  let count = 0;
  for (const cookie of cookies) {
    const encryptedValue = encryptValue(cookie.value);
    stmt.run(
      sessionId,
      cookie.name,
      encryptedValue,
      cookie.domain,
      cookie.path,
      cookie.expires > 0 ? new Date(cookie.expires * 1000).toISOString() : null,
      cookie.httpOnly ? 1 : 0,
      cookie.secure ? 1 : 0,
      cookie.sameSite,
    );
    count++;
  }
  return count;
}

/** Get decrypted cookies for a session, formatted as header value */
export function getCookieHeader(db: Database.Database, sessionId: number, domain: string): string | null {
  const rows = db.prepare(
    'SELECT name, value, domain, expires FROM cookies WHERE session_id = ? AND domain LIKE ?'
  ).all(sessionId, `%${domain}`) as Array<{ name: string; value: string; expires: string | null }>;

  if (rows.length === 0) return null;

  const now = new Date();
  const validCookies = rows.filter((r) => {
    if (!r.expires) return true;
    return new Date(r.expires) > now;
  });

  if (validCookies.length === 0) return null;

  return validCookies
    .map((r) => `${r.name}=${decryptValue(r.value)}`)
    .join('; ');
}

/** Check if any cookies for a session are expired */
export function getExpiredCookies(
  db: Database.Database,
  sessionId: number,
): Array<{ name: string; domain: string; expires: string }> {
  const now = new Date().toISOString();
  return db.prepare(
    'SELECT name, domain, expires FROM cookies WHERE session_id = ? AND expires IS NOT NULL AND expires < ?'
  ).all(sessionId, now) as Array<{ name: string; domain: string; expires: string }>;
}

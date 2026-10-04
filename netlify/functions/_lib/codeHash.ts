/**
 * One-way hashing of tutor passwords (FR-AUTH-006, §14.2.3).
 * scrypt with a per-password random salt plus a server-side pepper (TUTOR_CODE_PEPPER),
 * so a leaked hash alone cannot be brute-forced offline. The pepper variable keeps its
 * original name so existing deployments do not need a new setting.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, randomInt } from 'node:crypto';
import { generatePassword } from '../../../src/shared/tutorCode';

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

function scrypt(input: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(input, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(`${pepper}:${password}`, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string, pepper: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false; // e.g. "unset:" placeholder
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(`${pepper}:${password}`, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Burns comparable CPU when no candidate exists, so timing does not reveal valid prefixes. */
export async function dummyVerify(pepper: string): Promise<void> {
  await scrypt(`${pepper}:dummy`, Buffer.alloc(16), N, R, P);
}

/** Short fingerprint of the stored hash; embedded in session tokens so changing the password revokes sessions. */
export function hashFingerprint(storedHash: string): string {
  return createHash('sha256').update(storedHash).digest('base64url').slice(0, 16);
}

export function generateTutorPassword(): string {
  return generatePassword((max) => randomInt(max));
}

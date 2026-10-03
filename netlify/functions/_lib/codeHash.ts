/**
 * One-way hashing of tutor access codes (FR-AUTH-006, §14.2.3).
 * scrypt with a per-code random salt plus a server-side pepper (TUTOR_CODE_PEPPER):
 * because the code space per prefix is only 1,000, the pepper ensures a leaked
 * hash alone cannot be brute-forced offline.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash, randomInt } from 'node:crypto';
import { buildTutorCode } from '../../../src/shared/tutorCode';

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

export async function hashTutorCode(code: string, pepper: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(`${pepper}:${code}`, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyTutorCode(code: string, stored: string, pepper: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false; // e.g. "unset:" placeholder
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(`${pepper}:${code}`, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Burns comparable CPU when no candidate exists, so timing does not reveal valid prefixes. */
export async function dummyVerify(pepper: string): Promise<void> {
  await scrypt(`${pepper}:dummy`, Buffer.alloc(16), N, R, P);
}

/** Short fingerprint of the stored hash; embedded in session tokens so regenerating a code revokes sessions. */
export function hashFingerprint(storedHash: string): string {
  return createHash('sha256').update(storedHash).digest('base64url').slice(0, 16);
}

export function generateTutorCode(prefix: string): string {
  return buildTutorCode(prefix, (max) => randomInt(max));
}

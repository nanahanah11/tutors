/**
 * Short-lived tutor session token (PRD §14.2.5, FR-AUTH-008).
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, TUTOR_SESSION_SECRET)).
 * Delivered only as an HttpOnly, SameSite=Strict browser-session cookie.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TutorTokenPayload {
  v: 1;
  /** tutor profile id */
  sub: string;
  /** fingerprint of the tutor's current code hash */
  fp: string;
  /** issued-at (ms) – start of the absolute lifetime */
  iat: number;
  /** last activity (ms) – for the idle timeout */
  lst: number;
}

export const TUTOR_COOKIE = 'apu_tutor_session';

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function issueToken(payload: TutorTokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export type TokenCheck =
  | { ok: true; payload: TutorTokenPayload }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'expired' | 'idle' };

export function verifyToken(
  token: string | undefined,
  secret: string,
  opts: { now: number; maxAgeMs: number; idleMs: number },
): TokenCheck {
  if (!token) return { ok: false, reason: 'missing' };
  const [body, sig] = token.split('.');
  if (!body || !sig) return { ok: false, reason: 'malformed' };
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'bad_signature' };
  }
  let payload: TutorTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload?.v !== 1 || typeof payload.sub !== 'string' || typeof payload.iat !== 'number' || typeof payload.lst !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (opts.now - payload.iat > opts.maxAgeMs || payload.iat > opts.now + 60_000) return { ok: false, reason: 'expired' };
  if (opts.now - payload.lst > opts.idleMs) return { ok: false, reason: 'idle' };
  return { ok: true, payload };
}

/** Small HTTP helpers for Netlify Functions (Web Request/Response API). */
import { createHash } from 'node:crypto';
import { TUTOR_COOKIE } from './tokens';

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  const headers = new Headers({ ...SECURITY_HEADERS });
  for (const [k, v] of Object.entries(extraHeaders)) headers.append(k, v);
  return new Response(JSON.stringify(body), { status, headers });
}

export function withCookie(res: Response, cookie: string): Response {
  res.headers.append('Set-Cookie', cookie);
  return res;
}

export function error(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return json(status, { ok: false, error: code, ...extra });
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

/**
 * Browser-session cookie (no Max-Age/Expires => cleared when the browser closes, §34.3).
 * Scoped to /api so it is never sent with static assets.
 */
export function sessionCookie(token: string, secure: boolean): string {
  return `${TUTOR_COOKIE}=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${TUTOR_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

/** Client identifier for rate limiting: SHA-256 of the client IP (raw IPs are not stored). */
export function clientHash(req: Request, contextIp?: string): string {
  const ip =
    contextIp ||
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  return createHash('sha256').update(`apu-attendance:${ip}`).digest('hex');
}

/**
 * CSRF defence for state-changing requests: require a JSON body (forces a CORS
 * pre-flight cross-origin) and, when present, a same-origin Origin header.
 */
export function isSafeMutation(req: Request): boolean {
  const ct = req.headers.get('content-type') || '';
  if (!ct.toLowerCase().startsWith('application/json')) return false;
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const reqHost = new URL(req.url).host;
      const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
      const oHost = new URL(origin).host;
      if (oHost !== reqHost && oHost !== fwdHost) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function readJson(req: Request, maxBytes = 256 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  return text ? JSON.parse(text) : {};
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

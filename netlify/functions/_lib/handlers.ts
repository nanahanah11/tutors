/**
 * Request handlers for the tutor-code flow, tutor attendance API and lecturer
 * tutor-code administration. Pure functions of (Request, deps) so they can be
 * unit/authorization tested without Netlify or Supabase.
 */
import type { Backend, TutorRecord } from './backend';
import type { ServerConfig } from './config';
import {
  clearSessionCookie,
  clientHash,
  error,
  isSafeMutation,
  json,
  parseCookies,
  readJson,
  sessionCookie,
  UUID_PATTERN,
  withCookie,
} from './http';
import { issueToken, TUTOR_COOKIE, verifyToken } from './tokens';
import { dummyVerify, generateTutorCode, hashFingerprint, hashTutorCode, verifyTutorCode } from './codeHash';
import { DEFAULT_RATE_LIMIT, isBlocked, retryAfterSeconds, type RateLimitPolicy } from './rateLimit';
import { isValidTutorCodeFormat, normalizeTutorCode, tutorCodePrefix, TUTOR_PREFIX_PATTERN } from '../../../src/shared/tutorCode';
import { isValidDate, isValidTime } from '../../../src/shared/time';

export interface Deps {
  backend: Backend;
  config: ServerConfig;
  now?: () => number;
  rateLimit?: RateLimitPolicy;
  log?: (msg: string, err?: unknown) => void;
}

type Handler = (req: Request, clientIp?: string) => Promise<Response>;

const now = (d: Deps) => (d.now ? d.now() : Date.now());
const logErr = (d: Deps, msg: string, err?: unknown) =>
  (d.log ?? ((m: string, e?: unknown) => console.error(m, e instanceof Error ? e.message : e)))(msg, err);

/** Maps database business-error codes to HTTP status codes. */
const STATUS_BY_ERROR: Record<string, number> = {
  TUTOR_INACTIVE: 401,
  NOT_ASSIGNED: 403,
  NOT_OWNER: 403,
  EDIT_WINDOW_CLOSED: 403,
  NOT_FOUND: 404,
  DUPLICATE_SESSION: 409,
  PREFIX_IN_USE: 409,
};

function fromRpc(result: Record<string, unknown>, extraOk: Record<string, string> = {}): Response {
  if (result && result.ok === false) {
    const code = String(result.error ?? 'SERVER_ERROR');
    return json(STATUS_BY_ERROR[code] ?? 422, result);
  }
  return json(200, result, extraOk);
}

// ---------------------------------------------------------------------------
// Tutor code login / logout  (/api/tutor-auth/login, /api/tutor-auth/logout)
// ---------------------------------------------------------------------------
export function createTutorAuthHandler(deps: Deps): Handler {
  const policy = deps.rateLimit ?? DEFAULT_RATE_LIMIT;
  return async (req, clientIp) => {
    const url = new URL(req.url);
    const secure = deps.config.secureCookies;
    if (req.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED');
    if (!isSafeMutation(req)) return error(403, 'CSRF');

    if (url.pathname.endsWith('/logout')) {
      return withCookie(json(200, { ok: true }), clearSessionCookie(secure));
    }
    if (!url.pathname.endsWith('/login')) return error(404, 'NOT_FOUND');

    let body: { code?: unknown };
    try {
      body = (await readJson(req, 2048)) as { code?: unknown };
    } catch {
      return error(400, 'INVALID_PAYLOAD');
    }
    const code = normalizeTutorCode(typeof body.code === 'string' ? body.code : '');
    const prefix = tutorCodePrefix(code);
    const client = clientHash(req, clientIp);

    try {
      const since = new Date(now(deps) - policy.windowMs).toISOString();
      const counts = await deps.backend.countRecentFailures(client, prefix, since);
      if (isBlocked(counts, policy)) {
        const wait = retryAfterSeconds(policy);
        return error(429, 'RATE_LIMITED', { retry_after_seconds: wait });
      }

      let tutor: TutorRecord | null = null;
      if (prefix && isValidTutorCodeFormat(code)) {
        const candidates = await deps.backend.findActiveTutorsByPrefix(prefix);
        for (const c of candidates) {
          if (await verifyTutorCode(code, c.tutor_code_hash, deps.config.codePepper)) {
            tutor = c;
            break;
          }
        }
        if (candidates.length === 0) await dummyVerify(deps.config.codePepper);
      } else {
        await dummyVerify(deps.config.codePepper);
      }

      await deps.backend.recordAttempt({ clientHash: client, prefix, success: !!tutor });
      if (!tutor) {
        // Same response for unknown, wrong and inactive codes (FR-AUTH-009, §20.1)
        return error(401, 'INVALID_CODE');
      }

      const t = now(deps);
      const token = issueToken(
        { v: 1, sub: tutor.id, fp: hashFingerprint(tutor.tutor_code_hash), iat: t, lst: t },
        deps.config.sessionSecret,
      );
      return withCookie(
        json(200, { ok: true, tutor: { id: tutor.id, full_name: tutor.full_name } }),
        sessionCookie(token, secure),
      );
    } catch (e) {
      logErr(deps, 'tutor login failed', e);
      return error(500, 'SERVER_ERROR');
    }
  };
}

// ---------------------------------------------------------------------------
// Tutor session verification (every tutor request, §15.2)
// ---------------------------------------------------------------------------
async function authenticateTutor(
  req: Request,
  deps: Deps,
): Promise<{ tutor: TutorRecord; cookie: string } | Response> {
  const secure = deps.config.secureCookies;
  const token = parseCookies(req.headers.get('cookie'))[TUTOR_COOKIE];
  const t = now(deps);
  const check = verifyToken(token, deps.config.sessionSecret, {
    now: t,
    maxAgeMs: deps.config.sessionMaxAgeMs,
    idleMs: deps.config.sessionIdleMs,
  });
  if (!check.ok) return withCookie(error(401, 'UNAUTHENTICATED'), clearSessionCookie(secure));
  const tutor = await deps.backend.getTutor(check.payload.sub);
  // Deactivated tutor or regenerated code => existing sessions are revoked.
  if (!tutor || !tutor.is_active || hashFingerprint(tutor.tutor_code_hash) !== check.payload.fp) {
    return withCookie(error(401, 'UNAUTHENTICATED'), clearSessionCookie(secure));
  }
  // Sliding idle timeout: refresh last-seen on every authenticated request.
  const refreshed = issueToken({ ...check.payload, lst: t }, deps.config.sessionSecret);
  return { tutor, cookie: sessionCookie(refreshed, secure) };
}

// Fields a tutor may send. Anything else (apspace_status, tutor_profile_id, student
// master data, ...) is rejected outright (AC-014, BR-002).
const CREATE_FIELDS = new Set(['tutorial_group_id', 'class_date', 'class_time', 'records']);
const UPDATE_FIELDS = new Set(['records']);
const RECORD_FIELDS = new Set(['student_id', 'status', 'remark']);

function checkRecords(records: unknown): string | null {
  if (!Array.isArray(records)) return 'INVALID_PAYLOAD';
  if (records.length > 500) return 'INVALID_PAYLOAD';
  for (const r of records) {
    if (!r || typeof r !== 'object') return 'INVALID_PAYLOAD';
    for (const k of Object.keys(r)) if (!RECORD_FIELDS.has(k)) return 'FORBIDDEN_FIELD';
    const rec = r as Record<string, unknown>;
    if (typeof rec.student_id !== 'string' || !UUID_PATTERN.test(rec.student_id)) return 'INVALID_PAYLOAD';
    if (rec.status !== 'present' && rec.status !== 'absent') return 'UNMARKED_STUDENTS';
    if (rec.remark !== undefined && (typeof rec.remark !== 'string' || rec.remark.length > 500)) return 'INVALID_PAYLOAD';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tutor attendance API (/api/tutor/*)
// ---------------------------------------------------------------------------
export function createTutorApiHandler(deps: Deps): Handler {
  return async (req) => {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/tutor/, '').replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase();

    if (method !== 'GET' && !isSafeMutation(req)) return error(403, 'CSRF');

    try {
      const auth = await authenticateTutor(req, deps);
      if (auth instanceof Response) return auth;
      const { tutor, cookie } = auth;
      const tutorId = tutor.id; // resolved from the verified token – never from the request (FR-SES-007)
      const ok = (r: Response) => withCookie(r, cookie);
      const rpc = (fn: string, args: Record<string, unknown>) =>
        deps.backend.rpc<Record<string, unknown>>(fn, { p_tutor_profile_id: tutorId, ...args });

      // GET /me
      if (method === 'GET' && path === '/me') {
        return ok(fromRpc(await rpc('api_tutor_context', {})));
      }

      // GET /classes/:groupId/roster
      let m = /^\/classes\/([^/]+)\/roster$/.exec(path);
      if (method === 'GET' && m) {
        if (!UUID_PATTERN.test(m[1])) return ok(error(400, 'INVALID_PAYLOAD'));
        return ok(fromRpc(await rpc('api_tutor_roster', { p_group_id: m[1] })));
      }

      // GET /sessions
      if (method === 'GET' && path === '/sessions') {
        return ok(fromRpc(await rpc('api_tutor_sessions', { p_limit: 50 })));
      }

      // GET /sessions/lookup?groupId=&date=&time=
      if (method === 'GET' && path === '/sessions/lookup') {
        const groupId = url.searchParams.get('groupId') ?? '';
        const date = url.searchParams.get('date') ?? '';
        const time = url.searchParams.get('time') ?? '';
        if (!UUID_PATTERN.test(groupId) || !isValidDate(date) || !isValidTime(time)) {
          return ok(error(400, 'INVALID_PAYLOAD'));
        }
        return ok(fromRpc(await rpc('api_tutor_find_session', { p_group_id: groupId, p_class_date: date, p_class_time: time })));
      }

      // GET /sessions/:id
      m = /^\/sessions\/([^/]+)$/.exec(path);
      if (method === 'GET' && m) {
        if (!UUID_PATTERN.test(m[1])) return ok(error(400, 'INVALID_PAYLOAD'));
        return ok(fromRpc(await rpc('api_tutor_session_detail', { p_session_id: m[1] })));
      }

      // POST /sessions  (create)
      if (method === 'POST' && path === '/sessions') {
        let body: Record<string, unknown>;
        try {
          body = (await readJson(req)) as Record<string, unknown>;
        } catch {
          return ok(error(400, 'INVALID_PAYLOAD'));
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return ok(error(400, 'INVALID_PAYLOAD'));
        for (const k of Object.keys(body)) if (!CREATE_FIELDS.has(k)) return ok(error(403, 'FORBIDDEN_FIELD', { field: k }));
        const { tutorial_group_id, class_date, class_time, records } = body;
        if (typeof tutorial_group_id !== 'string' || !UUID_PATTERN.test(tutorial_group_id)) return ok(error(422, 'CLASS_REQUIRED'));
        if (typeof class_date !== 'string' || !isValidDate(class_date)) return ok(error(422, 'DATE_REQUIRED'));
        if (typeof class_time !== 'string' || !isValidTime(class_time)) return ok(error(422, 'TIME_REQUIRED'));
        const recErr = checkRecords(records);
        if (recErr) return ok(error(recErr === 'FORBIDDEN_FIELD' ? 403 : 422, recErr));
        const result = await rpc('api_tutor_save_attendance', {
          p_session_id: null,
          p_tutorial_group_id: tutorial_group_id,
          p_class_date: class_date,
          p_class_time: class_time,
          p_records: records,
        });
        return ok(fromRpc(result));
      }

      // PUT /sessions/:id  (same-day edit)
      m = /^\/sessions\/([^/]+)$/.exec(path);
      if ((method === 'PUT' || method === 'PATCH') && m) {
        if (!UUID_PATTERN.test(m[1])) return ok(error(400, 'INVALID_PAYLOAD'));
        let body: Record<string, unknown>;
        try {
          body = (await readJson(req)) as Record<string, unknown>;
        } catch {
          return ok(error(400, 'INVALID_PAYLOAD'));
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return ok(error(400, 'INVALID_PAYLOAD'));
        for (const k of Object.keys(body)) if (!UPDATE_FIELDS.has(k)) return ok(error(403, 'FORBIDDEN_FIELD', { field: k }));
        const recErr = checkRecords(body.records);
        if (recErr) return ok(error(recErr === 'FORBIDDEN_FIELD' ? 403 : 422, recErr));
        const result = await rpc('api_tutor_save_attendance', {
          p_session_id: m[1],
          p_tutorial_group_id: null,
          p_class_date: null,
          p_class_time: null,
          p_records: body.records,
        });
        return ok(fromRpc(result));
      }

      // Tutors can never delete attendance (BR-017) or touch anything else.
      if (method === 'DELETE') return ok(error(403, 'FORBIDDEN'));
      return ok(error(404, 'NOT_FOUND'));
    } catch (e) {
      logErr(deps, 'tutor api failed', e);
      return error(500, 'SERVER_ERROR');
    }
  };
}

// ---------------------------------------------------------------------------
// Lecturer: tutor profiles & access codes (/api/admin/tutors)
// ---------------------------------------------------------------------------
export function createAdminTutorsHandler(deps: Deps): Handler {
  return async (req) => {
    const method = req.method.toUpperCase();
    if (method !== 'GET' && !isSafeMutation(req)) return error(403, 'CSRF');
    const authz = req.headers.get('authorization') || '';
    const m = /^Bearer\s+(.+)$/i.exec(authz);
    if (!m) return error(401, 'UNAUTHENTICATED');
    try {
      const lecturer = await deps.backend.lecturerFromAccessToken(m[1]);
      if (!lecturer) return error(403, 'FORBIDDEN');

      if (method === 'GET') {
        return json(200, { ok: true, tutors: await deps.backend.listTutors() });
      }
      if (method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED');

      let body: Record<string, unknown>;
      try {
        body = (await readJson(req, 4096)) as Record<string, unknown>;
      } catch {
        return error(400, 'INVALID_PAYLOAD');
      }
      const action = body.action;
      const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
      const prefix = typeof body.prefix === 'string' ? body.prefix.trim().toUpperCase() : '';
      const tutorId = typeof body.tutor_id === 'string' ? body.tutor_id : null;

      if (action !== 'create' && action !== 'regenerate') return error(400, 'INVALID_PAYLOAD');
      if (action === 'create' && (!fullName || fullName.length > 100)) return error(422, 'INVALID_PAYLOAD');
      if (action === 'regenerate' && (!tutorId || !UUID_PATTERN.test(tutorId))) return error(422, 'INVALID_PAYLOAD');
      if (!TUTOR_PREFIX_PATTERN.test(prefix)) return error(422, 'INVALID_PAYLOAD', { field: 'prefix' });

      // Generate MAY### style code, hash it, store only the hash; return plaintext ONCE.
      const code = generateTutorCode(prefix);
      const hash = await hashTutorCode(code, deps.config.codePepper);
      const result = await deps.backend.rpc<Record<string, unknown>>('api_admin_upsert_tutor', {
        p_actor_profile_id: lecturer.id,
        p_tutor_profile_id: action === 'regenerate' ? tutorId : null,
        p_full_name: fullName || null,
        p_code_prefix: prefix,
        p_code_hash: hash,
      });
      if (result.ok === false) return fromRpc(result);
      return json(200, { ...result, code });
    } catch (e) {
      logErr(deps, 'admin tutors failed', e);
      return error(500, 'SERVER_ERROR');
    }
  };
}

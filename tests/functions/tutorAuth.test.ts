import { beforeEach, describe, expect, it } from 'vitest';
import { createTutorApiHandler, createTutorAuthHandler } from '../../netlify/functions/_lib/handlers';
import { readBody, cookieFrom, makeBackend, req, testConfig, type FakeBackend } from './fakeBackend';

let backend: FakeBackend;
let login: ReturnType<typeof createTutorAuthHandler>;
let api: ReturnType<typeof createTutorApiHandler>;

const post = (path: string, body: unknown, extra: RequestInit & { ip?: string } = {}) =>
  req(path, { method: 'POST', body: JSON.stringify(body), ...extra });

beforeEach(async () => {
  backend = await makeBackend();
  const deps = { backend, config: testConfig, now: () => backend.clock.now, log: () => {} };
  login = createTutorAuthHandler(deps);
  api = createTutorApiHandler(deps);
});

describe('tutor code validation (AC-001, AC-015, FR-AUTH-004..009)', () => {
  it('resolves a valid code to exactly one tutor and sets an HttpOnly session cookie', async () => {
    const res = await login(post('/api/tutor-auth/login', { code: ' may123 ' }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.tutor).toEqual({ id: backend.tutors[0].id, full_name: 'May' });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^apu_tutor_session=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(cookie).not.toMatch(/Max-Age|Expires/); // browser-session cookie
    expect(JSON.stringify(body)).not.toContain('MAY123'); // code never echoed
  });

  it('rejects wrong, malformed and inactive codes with the same generic error and no data', async () => {
    for (const code of ['MAY124', 'hello', 'AMIR456', '', 'ZED123']) {
      const res = await login(post('/api/tutor-auth/login', { code }, { ip: `198.51.100.${code.length}` }));
      expect(res.status).toBe(401);
      expect(await readBody(res)).toEqual({ ok: false, error: 'INVALID_CODE' });
      expect(res.headers.get('set-cookie')).toBeNull();
    }
    expect(backend.calls).toHaveLength(0); // no roster/attendance queried
  });

  it('rate-limits repeated failures from one client (FR-AUTH-007)', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login(post('/api/tutor-auth/login', { code: `MAY00${i}` }))).status).toBe(401);
    }
    const blocked = await login(post('/api/tutor-auth/login', { code: 'MAY123' }));
    expect(blocked.status).toBe(429);
    expect((await readBody(blocked)).error).toBe('RATE_LIMITED');
    // window expires after 15 minutes
    backend.clock.now += 15 * 60 * 1000 + 1;
    expect((await login(post('/api/tutor-auth/login', { code: 'MAY123' }))).status).toBe(200);
  });

  it('rate-limits distributed guessing of one prefix', async () => {
    for (let i = 0; i < 10; i++) {
      await login(post('/api/tutor-auth/login', { code: `MAY${String(900 + i)}` }, { ip: `192.0.2.${i}` }));
    }
    const res = await login(post('/api/tutor-auth/login', { code: 'MAY123' }, { ip: '192.0.2.200' }));
    expect(res.status).toBe(429);
  });

  it('requires JSON POST (CSRF defence)', async () => {
    const form = req('/api/tutor-auth/login', { method: 'POST', body: 'code=MAY123', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect((await login(form)).status).toBe(403);
    const cross = post('/api/tutor-auth/login', { code: 'MAY123' }, { headers: { origin: 'https://evil.example' } });
    expect((await login(cross)).status).toBe(403);
  });

  it('logout clears the cookie', async () => {
    const res = await login(post('/api/tutor-auth/logout', {}));
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('tutor session (FR-AUTH-008, §15.2)', () => {
  async function session() {
    const res = await login(post('/api/tutor-auth/login', { code: 'MAY123' }));
    return cookieFrom(res);
  }

  it('unvalidated visitors cannot reach any tutor endpoint (FR-AUTH-001)', async () => {
    for (const path of ['/api/tutor/me', '/api/tutor/sessions', '/api/tutor/classes/5b6ed0e1-853f-447d-8acd-7f3917272d61/roster']) {
      const res = await api(req(path));
      expect(res.status).toBe(401);
    }
    expect(backend.calls).toHaveLength(0);
  });

  it('rejects a forged/tampered token', async () => {
    const cookie = await session();
    const [name, value] = cookie.split('=');
    const [body, sig] = decodeURIComponent(value).split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    payload.sub = backend.tutors[1].id;
    const forged = `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${sig}`;
    const res = await api(req('/api/tutor/me', { headers: { cookie: `${name}=${encodeURIComponent(forged)}` } }));
    expect(res.status).toBe(401);
  });

  it('passes the token-resolved tutor id to the database, never a client value', async () => {
    const cookie = await session();
    const res = await api(req('/api/tutor/me?tutor_profile_id=22222222-2222-4222-8222-222222222222', { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(backend.calls[0]).toEqual({ fn: 'api_tutor_context', args: { p_tutor_profile_id: backend.tutors[0].id } });
  });

  it('expires after inactivity and after the absolute lifetime', async () => {
    const cookie = await session();
    backend.clock.now += 61 * 60 * 1000;
    expect((await api(req('/api/tutor/me', { headers: { cookie } }))).status).toBe(401);

    const c2 = await session();
    let current = c2;
    for (let i = 0; i < 5; i++) {
      backend.clock.now += 50 * 60 * 1000; // active every 50 min
      const r = await api(req('/api/tutor/me', { headers: { cookie: current } }));
      if (i < 4) {
        expect(r.status).toBe(200);
        current = cookieFrom(r);
      } else {
        expect(r.status).toBe(401); // > 4 hours since login
      }
    }
  });

  it('revokes sessions when the tutor is deactivated or the code is regenerated', async () => {
    const cookie = await session();
    backend.tutors[0].tutor_code_hash = 'scrypt$1$1$1$AAAA$BBBB';
    expect((await api(req('/api/tutor/me', { headers: { cookie } }))).status).toBe(401);
    backend.tutors[0].is_active = false;
    expect((await api(req('/api/tutor/me', { headers: { cookie } }))).status).toBe(401);
  });
});

describe('tutor attendance API authorization (§26.3, AC-014)', () => {
  const GROUP = '5b6ed0e1-853f-447d-8acd-7f3917272d61';
  const SESSION = '0d4c1d4e-9b0e-4c55-9f43-3b5a8c1e2f10';
  const STUDENT = 'a5f9d3c8-7a12-4b4e-9d1f-2c6e8b9a0f11';
  let cookie: string;
  beforeEach(async () => {
    cookie = cookieFrom(await login(post('/api/tutor-auth/login', { code: 'MAY123' })));
  });
  const json = (path: string, method: string, body: unknown) =>
    req(path, { method, body: JSON.stringify(body), headers: { cookie } });

  it('creates attendance through the trusted RPC', async () => {
    const res = await api(json('/api/tutor/sessions', 'POST', {
      tutorial_group_id: GROUP, class_date: '2026-10-03', class_time: '10:45',
      records: [{ student_id: STUDENT, status: 'present' }],
    }));
    expect(res.status).toBe(200);
    expect(backend.calls.at(-1)).toMatchObject({
      fn: 'api_tutor_save_attendance',
      args: { p_tutor_profile_id: backend.tutors[0].id, p_session_id: null, p_tutorial_group_id: GROUP },
    });
  });

  it('rejects attempts to change APSpace status or tutor identity', async () => {
    for (const extra of [{ apspace_status: 'keyed_in' }, { tutor_profile_id: backend.tutors[1].id }]) {
      const res = await api(json(`/api/tutor/sessions/${SESSION}`, 'PUT', { records: [], ...extra }));
      expect(res.status).toBe(403);
      expect((await readBody(res)).error).toBe('FORBIDDEN_FIELD');
    }
    const res = await api(json('/api/tutor/sessions', 'POST', {
      tutorial_group_id: GROUP, class_date: '2026-10-03', class_time: '10:45', apspace_status: 'keyed_in', records: [],
    }));
    expect(res.status).toBe(403);
    expect(backend.calls.filter((c) => c.fn === 'api_tutor_save_attendance')).toHaveLength(0);
  });

  it('rejects student master-data fields inside records', async () => {
    const res = await api(json(`/api/tutor/sessions/${SESSION}`, 'PUT', {
      records: [{ student_id: STUDENT, status: 'present', full_name: 'Renamed' }],
    }));
    expect(res.status).toBe(403);
  });

  it('rejects unmarked students before reaching the database', async () => {
    const res = await api(json('/api/tutor/sessions', 'POST', {
      tutorial_group_id: GROUP, class_date: '2026-10-03', class_time: '10:45',
      records: [{ student_id: STUDENT }],
    }));
    expect(res.status).toBe(422);
    expect((await readBody(res)).error).toBe('UNMARKED_STUDENTS');
  });

  it('maps database rule violations to HTTP errors', async () => {
    backend.rpcResults.api_tutor_save_attendance = { ok: false, error: 'EDIT_WINDOW_CLOSED' };
    let res = await api(json(`/api/tutor/sessions/${SESSION}`, 'PUT', { records: [{ student_id: STUDENT, status: 'absent' }] }));
    expect(res.status).toBe(403);
    expect((await readBody(res)).error).toBe('EDIT_WINDOW_CLOSED');

    backend.rpcResults.api_tutor_save_attendance = { ok: false, error: 'DUPLICATE_SESSION', existing_session_id: SESSION };
    res = await api(json('/api/tutor/sessions', 'POST', {
      tutorial_group_id: GROUP, class_date: '2026-10-03', class_time: '10:45', records: [{ student_id: STUDENT, status: 'present' }],
    }));
    expect(res.status).toBe(409);
    expect((await readBody(res)).existing_session_id).toBe(SESSION);

    backend.rpcResults.api_tutor_roster = { ok: false, error: 'NOT_ASSIGNED' };
    res = await api(req(`/api/tutor/classes/${GROUP}/roster`, { headers: { cookie } }));
    expect(res.status).toBe(403);
  });

  it('never allows deletes', async () => {
    const res = await api(req(`/api/tutor/sessions/${SESSION}`, { method: 'DELETE', headers: { cookie, 'content-type': 'application/json' } }));
    expect(res.status).toBe(403);
  });

  it('validates identifiers and dates', async () => {
    expect((await api(req('/api/tutor/classes/not-a-uuid/roster', { headers: { cookie } }))).status).toBe(400);
    expect((await api(req(`/api/tutor/sessions/lookup?groupId=${GROUP}&date=2026-13-01&time=10:00`, { headers: { cookie } }))).status).toBe(400);
  });
});

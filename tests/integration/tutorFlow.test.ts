/**
 * Integration tests (PRD §26.2/§26.3): real Netlify handlers -> real SQL functions.
 * Requires TEST_DATABASE_URL pointing at a database prepared by `npm run test:db` with KEEP_DB=1
 * (or `bash supabase/tests/run_local.sh`); skipped otherwise.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { pgBackend } from './pgBackend';
import { createAdminTutorsHandler, createTutorApiHandler, createTutorAuthHandler } from '../../netlify/functions/_lib/handlers';
import { cookieFrom, readBody, req, testConfig } from '../functions/fakeBackend';
import { malaysiaToday } from '../../src/shared/time';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('tutor attendance end-to-end through the API boundary', () => {
  let pool: pg.Pool;
  let login: ReturnType<typeof createTutorAuthHandler>;
  let api: ReturnType<typeof createTutorApiHandler>;
  let admin: ReturnType<typeof createAdminTutorsHandler>;
  let mayPassword = '';
  let amirPassword = '';
  let mayCookie = '';
  let amirCookie = '';
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await pool.query(`delete from tutor_code_attempts`);
    await pool.query(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a1da', 'aida@apu.edu.my') on conflict do nothing`);
    await pool.query(`insert into profiles (auth_user_id, full_name, role)
                      select '00000000-0000-0000-0000-00000000a1da', 'Ms Aida', 'lecturer'
                      where not exists (select 1 from profiles where role = 'lecturer')`);
    for (const [k, code] of [['g39', 'CT046-3-2-SDM-T-39'], ['g40', 'CT046-3-2-SDM-T-40'], ['g41', 'CT046-3-2-SDM-T-41'], ['g7', 'AAPP003-4-2-ISWE-T-7']]) {
      ids[k] = (await pool.query('select id from tutorial_groups where tutorial_code = $1', [code])).rows[0].id;
    }
    for (const p of ['MAY', 'AMIR']) {
      ids[p] = (await pool.query(`select id from profiles where tutor_code_prefix = $1`, [p])).rows[0].id;
    }
    const backend = pgBackend(pool);
    const deps = { backend, config: testConfig, log: () => {} };
    login = createTutorAuthHandler(deps);
    api = createTutorApiHandler(deps);
    admin = createAdminTutorsHandler(deps);
  });

  afterAll(async () => {
    await pool?.end();
  });

  const post = (path: string, b: unknown, extra: RequestInit & { ip?: string } = {}) =>
    req(path, { method: 'POST', body: JSON.stringify(b), ...extra });

  it('lecturer generates private passwords for May and Amir (stored hashed)', async () => {
    for (const [username, id] of [['MAY', ids.MAY], ['AMIR', ids.AMIR]]) {
      const res = await admin(post('/api/admin/tutors', { action: 'regenerate', tutor_id: id, username }, { headers: { authorization: 'Bearer aida@apu.edu.my' } }));
      const b = await readBody(res);
      expect(res.status).toBe(200);
      expect(b.password).toMatch(/^[A-Za-z2-9]{8}$/);
      if (username === 'MAY') mayPassword = b.password;
      else amirPassword = b.password;
    }
    const { rows } = await pool.query(`select tutor_code_hash from profiles where id = $1`, [ids.MAY]);
    expect(rows[0].tutor_code_hash).toMatch(/^scrypt\$/);
    expect(rows[0].tutor_code_hash).not.toContain(mayPassword);
    const audit = await pool.query(`select count(*)::int n from audit_logs where action = 'tutor_code_generated'`);
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('AC-015: invalid code reveals nothing; AC-001: valid code identifies May', async () => {
    const bad = await login(post('/api/tutor-auth/login', { username: 'MAY', password: `${mayPassword.slice(0, 7)}x` }, { ip: '10.0.0.9' }));
    expect(bad.status).toBe(401);
    expect(await readBody(bad)).toEqual({ ok: false, error: 'INVALID_CREDENTIALS' });

    const ok = await login(post('/api/tutor-auth/login', { username: 'may', password: mayPassword }));
    expect(ok.status).toBe(200);
    mayCookie = cookieFrom(ok);
    amirCookie = cookieFrom(await login(post('/api/tutor-auth/login', { username: 'AMIR', password: amirPassword })));

    const me = await readBody(await api(req('/api/tutor/me', { headers: { cookie: mayCookie } })));
    expect(me.tutor.full_name).toBe('May');
    expect(me.classes.map((c: { tutorial_code: string }) => c.tutorial_code)).toEqual(['CT046-3-2-SDM-T-39', 'CT046-3-2-SDM-T-40']);
    expect(me.today).toBe(malaysiaToday());
  });

  it('tutor cannot read an unassigned roster', async () => {
    const res = await api(req(`/api/tutor/classes/${ids.g41}/roster`, { headers: { cookie: mayCookie } }));
    expect(res.status).toBe(403);
    expect(JSON.stringify(await readBody(res))).not.toContain('TP9');
  });

  let sessionId = '';
  let roster: Array<{ id: string; student_id: string; full_name: string }> = [];

  it('AC-003/004: roster loads alphabetically; AC-006 incomplete save blocked; AC-007 save', async () => {
    const r = await readBody(await api(req(`/api/tutor/classes/${ids.g40}/roster`, { headers: { cookie: mayCookie } })));
    roster = r.students;
    expect(roster).toHaveLength(15);
    const names = roster.map((s) => s.full_name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));

    const records = roster.map((s, i) => ({ student_id: s.id, status: i < 2 ? 'absent' : 'present' }));
    const body = { tutorial_group_id: ids.g40, class_date: malaysiaToday(), class_time: '10:45', records: records.slice(1) };
    const incomplete = await api(req('/api/tutor/sessions', { method: 'POST', body: JSON.stringify(body), headers: { cookie: mayCookie } }));
    expect(incomplete.status).toBe(422);
    expect(await readBody(incomplete)).toMatchObject({ error: 'UNMARKED_STUDENTS', count: 1 });

    const saved = await api(req('/api/tutor/sessions', { method: 'POST', body: JSON.stringify({ ...body, records }), headers: { cookie: mayCookie } }));
    const sb = await readBody(saved);
    expect(saved.status).toBe(200);
    expect(sb.session).toMatchObject({ tutor_name: 'May', present_count: 13, absent_count: 2, apspace_status: 'pending', tutor_editable: true });
    sessionId = sb.session.id;

    // Lecturer dashboard view sees it immediately
    const dash = await pool.query(`select tutor_name_snapshot, present_count, absent_count from attendance_session_summary where id = $1`, [sessionId]);
    expect(dash.rows[0]).toEqual({ tutor_name_snapshot: 'May', present_count: 13, absent_count: 2 });
  });

  it('AC-012: duplicate is redirected to the existing record', async () => {
    const look = await readBody(
      await api(req(`/api/tutor/sessions/lookup?groupId=${ids.g40}&date=${malaysiaToday()}&time=10:45`, { headers: { cookie: mayCookie } })),
    );
    expect(look).toMatchObject({ exists: true, session_id: sessionId, own: true, tutor_editable: true });
  });

  it('AC-008: same-day edit is saved and audited; other tutor is refused', async () => {
    const records = roster.map((s) => ({ student_id: s.id, status: 'present' }));
    const res = await api(req(`/api/tutor/sessions/${sessionId}`, { method: 'PUT', body: JSON.stringify({ records }), headers: { cookie: mayCookie } }));
    expect(res.status).toBe(200);
    expect((await readBody(res)).changed).toBe(2);
    const a = await pool.query(`select count(*)::int n from audit_logs where session_id = $1 and action = 'tutor_edit'`, [sessionId]);
    expect(a.rows[0].n).toBe(1);

    const other = await api(req(`/api/tutor/sessions/${sessionId}`, { method: 'PUT', body: JSON.stringify({ records }), headers: { cookie: amirCookie } }));
    expect(other.status).toBe(403);
    expect((await readBody(other)).error).toBe('NOT_OWNER');
  });

  it('AC-014: tutor cannot change APSpace status', async () => {
    const res = await api(req(`/api/tutor/sessions/${sessionId}`, {
      method: 'PUT', body: JSON.stringify({ apspace_status: 'keyed_in', records: [] }), headers: { cookie: mayCookie },
    }));
    expect(res.status).toBe(403);
    const s = await pool.query(`select apspace_status from attendance_sessions where id = $1`, [sessionId]);
    expect(s.rows[0].apspace_status).toBe('pending');
  });

  it('AC-009: edit rejected after the class date (direct API attempt)', async () => {
    await pool.query(`update attendance_sessions set class_date = class_date - 1 where id = $1`, [sessionId]);
    const records = roster.map((s) => ({ student_id: s.id, status: 'absent' }));
    const res = await api(req(`/api/tutor/sessions/${sessionId}`, { method: 'PUT', body: JSON.stringify({ records }), headers: { cookie: mayCookie } }));
    expect(res.status).toBe(403);
    expect((await readBody(res)).error).toBe('EDIT_WINDOW_CLOSED');
    const detail = await readBody(await api(req(`/api/tutor/sessions/${sessionId}`, { headers: { cookie: mayCookie } })));
    expect(detail.session.tutor_editable).toBe(false);
    const absent = await pool.query(`select count(*)::int n from attendance_records where attendance_session_id = $1 and status = 'absent'`, [sessionId]);
    expect(absent.rows[0].n).toBe(0);
  });

  it('AC-016: data persists and tutor sees only own sessions', async () => {
    const mine = await readBody(await api(req('/api/tutor/sessions', { headers: { cookie: mayCookie } })));
    expect(mine.sessions.map((s: { id: string }) => s.id)).toContain(sessionId);
    const amirs = await readBody(await api(req('/api/tutor/sessions', { headers: { cookie: amirCookie } })));
    expect(amirs.sessions).toHaveLength(0);
  });

  it('resetting a password revokes the old password and existing sessions', async () => {
    await admin(post('/api/admin/tutors', { action: 'regenerate', tutor_id: ids.MAY, username: 'MAY' }, { headers: { authorization: 'Bearer aida@apu.edu.my' } }));
    expect((await api(req('/api/tutor/me', { headers: { cookie: mayCookie } }))).status).toBe(401);
    expect((await login(post('/api/tutor-auth/login', { username: 'MAY', password: mayPassword }, { ip: '10.0.0.77' }))).status).toBe(401);
  });

  it('AC-015: repeated invalid attempts are rate-limited', async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await login(post('/api/tutor-auth/login', { username: 'ARYA', password: `Wrong000${i}` }, { ip: '10.9.9.9' }))).status;
    }
    expect(last).toBe(429);
  });
});

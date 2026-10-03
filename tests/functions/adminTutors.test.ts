import { beforeEach, describe, expect, it } from 'vitest';
import { createAdminTutorsHandler } from '../../netlify/functions/_lib/handlers';
import { verifyTutorCode } from '../../netlify/functions/_lib/codeHash';
import { readBody, makeBackend, PEPPER, req, testConfig, type FakeBackend } from './fakeBackend';

let backend: FakeBackend;
let admin: ReturnType<typeof createAdminTutorsHandler>;
beforeEach(async () => {
  backend = await makeBackend();
  admin = createAdminTutorsHandler({ backend, config: testConfig, log: () => {} });
});

const call = (body: unknown, token = 'lecturer-jwt') =>
  req('/api/admin/tutors', { method: 'POST', body: JSON.stringify(body), headers: { authorization: `Bearer ${token}` } });

describe('tutor code administration (FR-AUTH-010, FR-TUT-001)', () => {
  it('requires a lecturer token', async () => {
    expect((await admin(req('/api/admin/tutors'))).status).toBe(401);
    expect((await admin(call({ action: 'regenerate' }, 'tutor-or-random')))).toHaveProperty('status', 403);
  });

  it('generates PREFIX### codes, stores only the hash and returns the code once', async () => {
    const res = await admin(call({ action: 'regenerate', tutor_id: backend.tutors[0].id, prefix: 'MAY' }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.code).toMatch(/^MAY\d{3}$/);
    const rpc = backend.calls.at(-1)!;
    expect(rpc.fn).toBe('api_admin_upsert_tutor');
    const hash = rpc.args.p_code_hash as string;
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain(body.code);
    expect(await verifyTutorCode(body.code, hash, PEPPER)).toBe(true);
    expect(rpc.args.p_actor_profile_id).toBe('99999999-9999-4999-8999-999999999999');
  });

  it('validates prefixes', async () => {
    const res = await admin(call({ action: 'create', full_name: 'Latifa', prefix: 'lat1' }));
    expect(res.status).toBe(422);
  });

  it('lists tutors without hashes', async () => {
    const res = await admin(req('/api/admin/tutors', { headers: { authorization: 'Bearer lecturer-jwt' } }));
    const body = await readBody(res);
    expect(JSON.stringify(body)).not.toContain('scrypt');
    expect(body.tutors[0]).toMatchObject({ full_name: 'May', code_set: true });
  });
});

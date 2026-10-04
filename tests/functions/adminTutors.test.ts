import { beforeEach, describe, expect, it } from 'vitest';
import { createAdminTutorsHandler } from '../../netlify/functions/_lib/handlers';
import { verifyPassword } from '../../netlify/functions/_lib/codeHash';
import { readBody, makeBackend, PEPPER, req, testConfig, type FakeBackend } from './fakeBackend';

let backend: FakeBackend;
let admin: ReturnType<typeof createAdminTutorsHandler>;
beforeEach(async () => {
  backend = await makeBackend();
  admin = createAdminTutorsHandler({ backend, config: testConfig, log: () => {} });
});

const call = (body: unknown, token = 'lecturer-jwt') =>
  req('/api/admin/tutors', { method: 'POST', body: JSON.stringify(body), headers: { authorization: `Bearer ${token}` } });

describe('tutor password administration (FR-AUTH-010, FR-TUT-001)', () => {
  it('requires a lecturer token', async () => {
    expect((await admin(req('/api/admin/tutors'))).status).toBe(401);
    expect((await admin(call({ action: 'regenerate' }, 'tutor-or-random')))).toHaveProperty('status', 403);
  });

  it('generates 8-character passwords, stores only the hash and returns the password once', async () => {
    const res = await admin(call({ action: 'regenerate', tutor_id: backend.tutors[0].id, username: 'MAY' }));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.password).toMatch(/^[A-Za-z2-9]{8}$/);
    expect(body.password).toMatch(/[a-z]/);
    expect(body.password).toMatch(/[A-Z]/);
    expect(body.password).toMatch(/\d/);
    const rpc = backend.calls.at(-1)!;
    expect(rpc.fn).toBe('api_admin_upsert_tutor');
    const hash = rpc.args.p_code_hash as string;
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain(body.password);
    expect(await verifyPassword(body.password, hash, PEPPER)).toBe(true);
    expect(rpc.args.p_actor_profile_id).toBe('99999999-9999-4999-8999-999999999999');
  });

  it('validates prefixes', async () => {
    const res = await admin(call({ action: 'create', full_name: 'Latifa', username: 'lat1' }));
    expect(res.status).toBe(422);
  });

  it('lists tutors without hashes', async () => {
    const res = await admin(req('/api/admin/tutors', { headers: { authorization: 'Bearer lecturer-jwt' } }));
    const body = await readBody(res);
    expect(JSON.stringify(body)).not.toContain('scrypt');
    expect(body.tutors[0]).toMatchObject({ full_name: 'May', code_set: true });
  });
});

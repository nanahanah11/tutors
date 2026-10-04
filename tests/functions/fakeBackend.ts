import type { Backend, TutorRecord } from '../../netlify/functions/_lib/backend';
import type { ServerConfig } from '../../netlify/functions/_lib/config';
import { hashPassword } from '../../netlify/functions/_lib/codeHash';

export const PEPPER = 'test-pepper-0123456789';
export const MAY_PASSWORD = 'Maple482';
export const AMIR_PASSWORD = 'Amir4567';

export const testConfig: ServerConfig = {
  supabaseUrl: 'http://localhost',
  serviceRoleKey: 'service',
  sessionSecret: 'x'.repeat(40),
  codePepper: PEPPER,
  sessionMaxAgeMs: 4 * 60 * 60 * 1000,
  sessionIdleMs: 60 * 60 * 1000,
  secureCookies: true,
};

export interface FakeBackend extends Backend {
  tutors: TutorRecord[];
  attempts: Array<{ clientHash: string; prefix: string | null; success: boolean; at: number }>;
  calls: Array<{ fn: string; args: Record<string, unknown> }>;
  rpcResults: Record<string, Record<string, unknown>>;
  clock: { now: number };
}

export async function makeBackend(): Promise<FakeBackend> {
  const clock = { now: Date.parse('2026-10-03T02:00:00Z') };
  const tutors: TutorRecord[] = [
    { id: '11111111-1111-4111-8111-111111111111', full_name: 'May', tutor_code_prefix: 'MAY',
      tutor_code_hash: await hashPassword(MAY_PASSWORD, PEPPER), is_active: true },
    { id: '22222222-2222-4222-8222-222222222222', full_name: 'Amir', tutor_code_prefix: 'AMIR',
      tutor_code_hash: await hashPassword(AMIR_PASSWORD, PEPPER), is_active: false },
  ];
  const fb: FakeBackend = {
    tutors,
    attempts: [],
    calls: [],
    rpcResults: {},
    clock,
    async findActiveTutorsByPrefix(prefix) {
      return tutors.filter((t) => t.tutor_code_prefix === prefix && t.is_active);
    },
    async getTutor(id) {
      return tutors.find((t) => t.id === id) ?? null;
    },
    async countRecentFailures(clientHash, prefix, sinceIso) {
      const since = Date.parse(sinceIso);
      const recent = fb.attempts.filter((a) => !a.success && a.at >= since);
      return {
        client: recent.filter((a) => a.clientHash === clientHash).length,
        prefix: prefix ? recent.filter((a) => a.prefix === prefix).length : 0,
      };
    },
    async recordAttempt(a) {
      fb.attempts.push({ ...a, at: clock.now });
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      fb.calls.push({ fn, args });
      return (fb.rpcResults[fn] ?? { ok: true }) as T;
    },
    async lecturerFromAccessToken(token) {
      return token === 'lecturer-jwt' ? { id: '99999999-9999-4999-8999-999999999999', full_name: 'Ms Aida' } : null;
    },
    async listTutors() {
      return tutors.map(({ tutor_code_hash, ...t }) => ({ ...t, code_set: tutor_code_hash.startsWith('scrypt$'), tutor_code_updated_at: null }));
    },
  };
  return fb;
}

export function req(path: string, init: RequestInit & { ip?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.set('x-nf-client-connection-ip', init.ip ?? '203.0.113.7');
  return new Request(`https://attendance.example.edu.my${path}`, { ...init, headers });
}

export function cookieFrom(res: Response): string {
  const set = res.headers.get('set-cookie') ?? '';
  return set.split(';')[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readBody = (res: Response): Promise<any> => res.json();

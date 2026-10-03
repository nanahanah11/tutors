/**
 * Backend implementation over a direct PostgreSQL connection, used to run the real
 * Netlify handlers against a local database migrated with supabase/migrations.
 * RPCs execute as the `service_role` role, exactly like the Supabase service key.
 */
import pg from 'pg';
import type { Backend, TutorRecord } from '../../netlify/functions/_lib/backend';

export function pgBackend(pool: pg.Pool): Backend {
  const asService = async <T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> => {
    const c = await pool.connect();
    try {
      await c.query('begin; set local role service_role');
      const r = await fn(c);
      await c.query('commit');
      return r;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  };
  return {
    async findActiveTutorsByPrefix(prefix) {
      const { rows } = await pool.query<TutorRecord>(
        `select id, full_name, tutor_code_prefix, tutor_code_hash, is_active from profiles
          where role = 'tutor' and is_active and tutor_code_prefix = $1`,
        [prefix],
      );
      return rows;
    },
    async getTutor(id) {
      const { rows } = await pool.query<TutorRecord>(
        `select id, full_name, tutor_code_prefix, tutor_code_hash, is_active from profiles where role = 'tutor' and id = $1`,
        [id],
      );
      return rows[0] ?? null;
    },
    async countRecentFailures(clientHash, prefix, sinceIso) {
      const { rows } = await pool.query(
        `select count(*) filter (where client_hash = $1)::int as client,
                count(*) filter (where code_prefix = $2)::int as prefix
           from tutor_code_attempts where not success and attempted_at >= $3`,
        [clientHash, prefix, sinceIso],
      );
      return { client: rows[0].client, prefix: prefix ? rows[0].prefix : 0 };
    },
    async recordAttempt({ clientHash, prefix, success }) {
      await pool.query('insert into tutor_code_attempts (client_hash, code_prefix, success) values ($1, $2, $3)', [
        clientHash,
        prefix,
        success,
      ]);
    },
    async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
      if (!/^[a-z_]+$/.test(fn)) throw new Error('bad fn');
      const keys = Object.keys(args);
      // Named-argument call, mirroring PostgREST /rpc semantics (catches argument-name drift).
      const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
      const values = keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
      return asService(async (c) => (await c.query(sql, values)).rows[0].r as T);
    },
    async lecturerFromAccessToken(token) {
      if (token.split('.').length === 3 && !token.includes('@')) {
        // Local E2E: a lecturer JWT signed for PostgREST – resolve by subject.
        const sub = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
        const r = await pool.query(
          `select id, full_name from profiles where auth_user_id = $1 and role = 'lecturer' and is_active`,
          [sub],
        );
        return r.rows[0] ?? null;
      }
      const { rows } = await pool.query(
        `select p.id, p.full_name from profiles p join auth.users u on u.id = p.auth_user_id
          where u.email = $1 and p.role = 'lecturer' and p.is_active`,
        [token],
      );
      return rows[0] ?? null;
    },
    async listTutors() {
      const { rows } = await pool.query(
        `select id, full_name, tutor_code_prefix, tutor_code_updated_at, is_active,
                tutor_code_hash like 'scrypt$%' as code_set from profiles where role = 'tutor' order by full_name`,
      );
      return rows;
    },
  };
}

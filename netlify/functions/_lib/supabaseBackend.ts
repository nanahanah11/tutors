import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend, TutorRecord } from './backend';
import type { ServerConfig } from './config';

let cached: { key: string; client: SupabaseClient } | null = null;

function adminClient(cfg: ServerConfig): SupabaseClient {
  const key = `${cfg.supabaseUrl}|${cfg.serviceRoleKey.slice(-8)}`;
  if (!cached || cached.key !== key) {
    cached = {
      key,
      client: createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    };
  }
  return cached.client;
}

const TUTOR_COLUMNS = 'id, full_name, tutor_code_prefix, tutor_code_hash, is_active';

export function supabaseBackend(cfg: ServerConfig): Backend {
  const db = adminClient(cfg);
  return {
    async findActiveTutorsByPrefix(prefix) {
      const { data, error } = await db
        .from('profiles')
        .select(TUTOR_COLUMNS)
        .eq('role', 'tutor')
        .eq('is_active', true)
        .eq('tutor_code_prefix', prefix);
      if (error) throw error;
      return (data ?? []) as TutorRecord[];
    },
    async getTutor(id) {
      const { data, error } = await db.from('profiles').select(TUTOR_COLUMNS).eq('role', 'tutor').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as TutorRecord) ?? null;
    },
    async countRecentFailures(clientHash, prefix, sinceIso) {
      const clientQ = db
        .from('tutor_code_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('client_hash', clientHash)
        .eq('success', false)
        .gte('attempted_at', sinceIso);
      const prefixQ = prefix
        ? db
            .from('tutor_code_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('code_prefix', prefix)
            .eq('success', false)
            .gte('attempted_at', sinceIso)
        : null;
      const [c, p] = await Promise.all([clientQ, prefixQ]);
      if (c.error) throw c.error;
      if (p?.error) throw p.error;
      return { client: c.count ?? 0, prefix: p?.count ?? 0 };
    },
    async recordAttempt({ clientHash, prefix, success }) {
      const { error } = await db.from('tutor_code_attempts').insert({ client_hash: clientHash, code_prefix: prefix, success });
      if (error) throw error;
      // Occasionally prune attempts older than 7 days; only recent rows matter for rate limiting.
      if (Math.random() < 0.05) {
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        await db.from('tutor_code_attempts').delete().lt('attempted_at', cutoff);
      }
    },
    async rpc(fn, args) {
      const { data, error } = await db.rpc(fn, args);
      if (error) throw error;
      return data;
    },
    async lecturerFromAccessToken(accessToken) {
      const { data, error } = await db.auth.getUser(accessToken);
      if (error || !data.user) return null;
      const { data: profile, error: pErr } = await db
        .from('profiles')
        .select('id, full_name')
        .eq('auth_user_id', data.user.id)
        .eq('role', 'lecturer')
        .eq('is_active', true)
        .maybeSingle();
      if (pErr) throw pErr;
      return profile ?? null;
    },
    async listTutors() {
      const { data, error } = await db
        .from('profiles')
        .select('id, full_name, tutor_code_prefix, tutor_code_hash, tutor_code_updated_at, is_active')
        .eq('role', 'tutor')
        .order('full_name');
      if (error) throw error;
      return (data ?? []).map(({ tutor_code_hash, ...rest }) => ({
        ...rest,
        code_set: typeof tutor_code_hash === 'string' && tutor_code_hash.startsWith('scrypt$'),
      }));
    },
  };
}

/** Shared helpers for the deployment CLI scripts (server-side only; uses the service role key). */
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Minimal .env loader so scripts work without extra dependencies. Existing env vars win. */
export function loadDotEnv(path = '.env'): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✘ Missing environment variable ${name} (see .env.example)`);
    process.exit(1);
  }
  return v;
}

export function adminClient(): SupabaseClient {
  loadDotEnv();
  const url = process.env.SUPABASE_URL || requireEnv('VITE_SUPABASE_URL');
  return createClient(url, requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function parseArgs(argv: string[]): { flags: Record<string, string | true>; positional: string[] } {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}

export async function lecturerProfileId(db: SupabaseClient): Promise<{ id: string; full_name: string }> {
  const { data, error } = await db.from('profiles').select('id, full_name').eq('role', 'lecturer').eq('is_active', true);
  if (error) throw error;
  if (!data?.length) {
    console.error('✘ No active lecturer profile. Run `npm run bootstrap -- --email <ms-aida-email>` first.');
    process.exit(1);
  }
  if (data.length > 1) console.warn('! More than one active lecturer profile; using the first.');
  return data[0];
}

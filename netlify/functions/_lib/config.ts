/** Server-only configuration (PRD §17). Never imported by browser code. */
export interface ServerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  sessionSecret: string;
  codePepper: string;
  /** Absolute tutor session lifetime (PRD §34.3: 4 hours). */
  sessionMaxAgeMs: number;
  /** Inactivity timeout (FR-AUTH-008). */
  sessionIdleMs: number;
  /** Mark cookies Secure (disable only for plain-http local development). */
  secureCookies: boolean;
}

export class ConfigError extends Error {
  constructor(public missing: string[], message: string) {
    super(message);
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const missing = ['TUTOR_SESSION_SECRET', 'TUTOR_CODE_PEPPER', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !env[k]);
  if (!env.SUPABASE_URL && !env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (missing.length) {
    throw new ConfigError(missing, `Missing required server environment variable(s): ${missing.join(', ')}`);
  }
  const sessionSecret = env.TUTOR_SESSION_SECRET as string;
  const codePepper = env.TUTOR_CODE_PEPPER as string;
  if (sessionSecret.length < 32) throw new ConfigError(['TUTOR_SESSION_SECRET'], 'TUTOR_SESSION_SECRET must be at least 32 characters');
  if (codePepper.length < 16) throw new ConfigError(['TUTOR_CODE_PEPPER'], 'TUTOR_CODE_PEPPER must be at least 16 characters');
  return {
    supabaseUrl: (env.SUPABASE_URL || env.VITE_SUPABASE_URL) as string,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
    sessionSecret,
    codePepper,
    sessionMaxAgeMs: Number(env.TUTOR_SESSION_MAX_HOURS || 4) * 60 * 60 * 1000,
    sessionIdleMs: Number(env.TUTOR_SESSION_IDLE_MINUTES || 60) * 60 * 1000,
    secureCookies: env.TUTOR_COOKIE_INSECURE !== 'true',
  };
}

/**
 * JSON 500 for a misconfigured deployment. Only variable NAMES are returned, never values,
 * so an administrator can see what to fix straight from the browser.
 */
export function configErrorResponse(e: unknown): Response {
  const missing = e instanceof ConfigError ? e.missing : [];
  console.error('server configuration error', e instanceof Error ? e.message : e);
  return new Response(JSON.stringify({ ok: false, error: 'CONFIG_ERROR', missing }), {
    status: 500,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

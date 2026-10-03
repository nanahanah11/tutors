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

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required server environment variable ${name}`);
  return v;
}

export function loadConfig(): ServerConfig {
  const sessionSecret = required('TUTOR_SESSION_SECRET');
  const codePepper = required('TUTOR_CODE_PEPPER');
  if (sessionSecret.length < 32) throw new Error('TUTOR_SESSION_SECRET must be at least 32 characters');
  if (codePepper.length < 16) throw new Error('TUTOR_CODE_PEPPER must be at least 16 characters');
  return {
    supabaseUrl: process.env.SUPABASE_URL || required('VITE_SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    sessionSecret,
    codePepper,
    sessionMaxAgeMs: Number(process.env.TUTOR_SESSION_MAX_HOURS || 4) * 60 * 60 * 1000,
    sessionIdleMs: Number(process.env.TUTOR_SESSION_IDLE_MINUTES || 60) * 60 * 1000,
    secureCookies: process.env.TUTOR_COOKIE_INSECURE !== 'true',
  };
}

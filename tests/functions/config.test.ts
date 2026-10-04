import { describe, expect, it } from 'vitest';
import { ConfigError, configErrorResponse, loadConfig } from '../../netlify/functions/_lib/config';

const ok = {
  TUTOR_SESSION_SECRET: 'x'.repeat(40),
  TUTOR_CODE_PEPPER: 'p'.repeat(20),
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  VITE_SUPABASE_URL: 'https://x.supabase.co',
};

describe('server configuration', () => {
  it('loads a complete environment', () => {
    expect(loadConfig(ok).supabaseUrl).toBe('https://x.supabase.co');
  });
  it('reports every missing variable by name', () => {
    try {
      loadConfig({ TUTOR_CODE_PEPPER: ok.TUTOR_CODE_PEPPER });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).missing).toEqual(['TUTOR_SESSION_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL']);
    }
  });
  it('returns JSON naming the missing variables but no values', async () => {
    const res = configErrorResponse(new ConfigError(['TUTOR_SESSION_SECRET'], 'x'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'CONFIG_ERROR', missing: ['TUTOR_SESSION_SECRET'] });
  });
});

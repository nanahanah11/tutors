/**
 * Netlify Function: tutor access-code validation (PRD §14.2, FR-AUTH-004..009).
 *   POST /api/tutor-auth/login   { code: "MAY123" } -> sets HttpOnly session cookie
 *   POST /api/tutor-auth/logout
 */
import type { Config, Context } from '@netlify/functions';
import { configErrorResponse, loadConfig, type ServerConfig } from './_lib/config';
import { supabaseBackend } from './_lib/supabaseBackend';
import { createTutorAuthHandler } from './_lib/handlers';

export default async (req: Request, context: Context) => {
  let config: ServerConfig;
  try {
    config = loadConfig();
  } catch (e) {
    return configErrorResponse(e);
  }
  return createTutorAuthHandler({ config, backend: supabaseBackend(config) })(req, context.ip);
};

export const config: Config = {
  path: ['/api/tutor-auth/login', '/api/tutor-auth/logout'],
};

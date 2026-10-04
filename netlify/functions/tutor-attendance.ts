/**
 * Netlify Function: tutor attendance API (PRD §15.2). Every request requires a
 * valid tutor session cookie; tutor identity comes from the token only.
 */
import type { Config, Context } from '@netlify/functions';
import { configErrorResponse, loadConfig, type ServerConfig } from './_lib/config';
import { supabaseBackend } from './_lib/supabaseBackend';
import { createTutorApiHandler } from './_lib/handlers';

export default async (req: Request, context: Context) => {
  let config: ServerConfig;
  try {
    config = loadConfig();
  } catch (e) {
    return configErrorResponse(e);
  }
  return createTutorApiHandler({ config, backend: supabaseBackend(config) })(req, context.ip);
};

export const config: Config = {
  path: '/api/tutor/*',
};

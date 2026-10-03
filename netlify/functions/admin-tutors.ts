/**
 * Netlify Function: lecturer-only tutor profile & access-code management
 * (FR-AUTH-010, FR-TUT-001, §11.8 "Tutor Access Codes").
 * Requires Ms Aida's Supabase Auth access token (Authorization: Bearer ...).
 */
import type { Config, Context } from '@netlify/functions';
import { loadConfig } from './_lib/config';
import { supabaseBackend } from './_lib/supabaseBackend';
import { createAdminTutorsHandler } from './_lib/handlers';

export default async (req: Request, context: Context) => {
  const config = loadConfig();
  return createAdminTutorsHandler({ config, backend: supabaseBackend(config) })(req, context.ip);
};

export const config: Config = {
  path: '/api/admin/tutors',
};

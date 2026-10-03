/**
 * Browser Supabase client – lecturer only (PRD §14.1, §15.3).
 * Uses the publishable/anon key; all access is constrained by RLS.
 * Tutors never use this client: they go through the Netlify Functions.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-publishable-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Session survives reloads in this tab only; closing the browser signs the lecturer out.
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
  },
});

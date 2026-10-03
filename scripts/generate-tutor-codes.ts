/**
 * Generates private tutor access codes (<FIRSTNAME><3 random digits>) and stores only
 * their scrypt hashes (PRD FR-AUTH-006, FR-TUT-007, §32.1 step 6).
 *
 *   npm run codes:generate                 # all active tutors
 *   npm run codes:generate -- --only MAY   # one tutor (also regenerates a compromised code)
 *   npm run codes:generate -- --missing    # only tutors whose code was never generated
 *
 * Codes are printed ONCE to the terminal. Never commit them; share each code only
 * with the relevant tutor. Requires TUTOR_CODE_PEPPER identical to the Netlify value.
 */
import { generateTutorCode, hashTutorCode } from '../netlify/functions/_lib/codeHash';
import { adminClient, lecturerProfileId, parseArgs, requireEnv } from './_shared';

const { flags } = parseArgs(process.argv.slice(2));
const db = adminClient();
const pepper = requireEnv('TUTOR_CODE_PEPPER');
if (pepper.length < 16) {
  console.error('✘ TUTOR_CODE_PEPPER must be at least 16 characters');
  process.exit(1);
}
const lecturer = await lecturerProfileId(db);

const { data: tutors, error } = await db
  .from('profiles')
  .select('id, full_name, tutor_code_prefix, tutor_code_hash')
  .eq('role', 'tutor')
  .eq('is_active', true)
  .order('full_name');
if (error) throw error;

const only = typeof flags.only === 'string' ? flags.only.toUpperCase() : null;
const selected = (tutors ?? []).filter(
  (t) => (!only || t.tutor_code_prefix === only) && (!flags.missing || !String(t.tutor_code_hash).startsWith('scrypt$')),
);
if (selected.length === 0) {
  console.log('No matching active tutors.');
  process.exit(0);
}

const issued: Array<[string, string]> = [];
for (const t of selected) {
  const code = generateTutorCode(t.tutor_code_prefix);
  const hash = await hashTutorCode(code, pepper);
  const { data, error: rpcErr } = await db.rpc('api_admin_upsert_tutor', {
    p_actor_profile_id: lecturer.id,
    p_tutor_profile_id: t.id,
    p_full_name: null,
    p_code_prefix: t.tutor_code_prefix,
    p_code_hash: hash,
  });
  if (rpcErr || data?.ok === false) {
    console.error(`✘ ${t.full_name}: ${rpcErr?.message ?? data?.error}`);
    continue;
  }
  issued.push([t.full_name, code]);
}

console.log('\nTutor access codes – share each one privately with that tutor only. They will NOT be shown again.\n');
for (const [name, code] of issued) console.log(`  ${name.padEnd(12)} ${code}`);
console.log('\nOld codes for these tutors have stopped working and their active sessions are signed out.');

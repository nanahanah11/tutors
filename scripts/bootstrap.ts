/**
 * Creates Ms Aida's lecturer Supabase Auth account and application profile (PRD §32.1 step 4).
 *
 *   npm run bootstrap -- --email aida@example.edu.my [--name "Ms Aida"]
 *
 * The password is read from LECTURER_INITIAL_PASSWORD, or a strong random one is generated
 * and printed once. Ms Aida should change it after first login (Supabase password reset).
 * Idempotent: an existing auth user / profile is reused.
 */
import { randomBytes } from 'node:crypto';
import { adminClient, parseArgs } from './_shared';

const { flags } = parseArgs(process.argv.slice(2));
const email = typeof flags.email === 'string' ? flags.email.trim().toLowerCase() : '';
const name = typeof flags.name === 'string' ? flags.name : 'Ms Aida';
if (!email) {
  console.error('Usage: npm run bootstrap -- --email <lecturer-email> [--name "Ms Aida"]');
  process.exit(1);
}

const db = adminClient();

async function findUser(): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

let userId = await findUser();
let generated: string | null = null;
if (!userId) {
  const password = process.env.LECTURER_INITIAL_PASSWORD || (generated = randomBytes(18).toString('base64url'));
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (error) throw error;
  userId = data.user.id;
  console.log(`✔ Created Supabase Auth user ${email}`);
} else {
  console.log(`• Auth user ${email} already exists`);
}

const { data: existing, error: pErr } = await db.from('profiles').select('id, role').eq('auth_user_id', userId).maybeSingle();
if (pErr) throw pErr;
if (existing) {
  console.log(`• Profile already exists (${existing.role})`);
} else {
  const { error } = await db.from('profiles').insert({ auth_user_id: userId, full_name: name, role: 'lecturer' });
  if (error) throw error;
  console.log(`✔ Created lecturer profile "${name}"`);
}
if (generated) {
  console.log('\nInitial password (shown once – give it to Ms Aida privately and change it after first login):');
  console.log(`  ${generated}\n`);
}

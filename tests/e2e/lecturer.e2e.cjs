// Lecturer flow E2E (PRD §26.4 flows 5–6) against real PostgREST + RLS
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
const SP = process.env.E2E_OUT;
const base = 'http://localhost:5179';
const jwt = fs.readFileSync(`${SP}/lect.jwt`, 'utf8').trim();
const session = {
  access_token: jwt, refresh_token: 'local-refresh', token_type: 'bearer', expires_in: 28800,
  expires_at: Math.floor(Date.now() / 1000) + 28800,
  user: { id: '00000000-0000-0000-0000-00000000a1da', aud: 'authenticated', role: 'authenticated', email: 'aida@apu.edu.my' },
};
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const step = async (name, fn) => { await fn(); console.log('✔', name); };

  await step('unauthenticated lecturer route -> login', async () => {
    await page.goto(`${base}/lecturer`);
    await page.getByRole('heading', { name: 'Lecturer Login' }).waitFor();
  });
  await step('authenticated lecturer sees dashboard', async () => {
    await page.evaluate((s) => sessionStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)), session);
    await page.goto(`${base}/lecturer`);
    await page.getByRole('heading', { name: 'Attendance Dashboard' }).waitFor();
  });
  let code;
  await step('regenerate May code from Tutors page (shown once)', async () => {
    await page.getByRole('link', { name: 'Tutors & Codes' }).click();
    await page.getByRole('heading', { name: 'Tutor profiles' }).waitFor();
    page.once('dialog', (d) => d.accept());
    const row = page.locator('tr', { hasText: 'MAY###' });
    await row.getByRole('button', { name: /Regenerate code|Generate code/ }).click();
    const dlg = page.locator('dialog.modal');
    await dlg.getByText('New tutor access code').waitFor();
    code = (await dlg.locator('p.mono').innerText()).trim();
    if (!/^MAY\d{3}$/.test(code)) throw new Error(code);
    await page.screenshot({ path: `${SP}/10-code-modal.png` });
    await dlg.getByRole('button', { name: 'I have recorded the code' }).click();
  });
  await step('assign Arya temporary cover of SDM-T-38', async () => {
    await page.selectOption('#a-tutor', { label: 'Arya' });
    await page.selectOption('#a-group', { label: 'SDM – CT046-3-2-SDM-T-38 (unassigned)' });
    await page.getByLabel('Temporary cover').check();
    await page.getByRole('button', { name: 'Assign' }).click();
    await page.getByText('Assigned to CT046-3-2-SDM-T-38.').waitFor();
    await page.screenshot({ path: `${SP}/11-tutors.png`, fullPage: true });
  });
  await step('tutor saves attendance via API using new code', async () => {
    const r1 = await fetch(`${base}/api/tutor-auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    if (r1.status !== 200) throw new Error('login ' + r1.status);
    const cookie = r1.headers.get('set-cookie').split(';')[0];
    const me = await (await fetch(`${base}/api/tutor/me`, { headers: { cookie } })).json();
    const g = me.classes.find((c) => c.tutorial_code.endsWith('T-39'));
    const roster = await (await fetch(`${base}/api/tutor/classes/${g.tutorial_group_id}/roster`, { headers: { cookie } })).json();
    const records = roster.students.map((s, i) => ({ student_id: s.id, status: i % 4 === 0 ? 'absent' : 'present' }));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
    const r = await fetch(`${base}/api/tutor/sessions`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ tutorial_group_id: g.tutorial_group_id, class_date: today, class_time: '14:00', records }) });
    if (r.status !== 200) throw new Error('save ' + r.status + (await r.text()));
  });
  await step('dashboard shows the new session immediately as Pending', async () => {
    await page.getByRole('link', { name: 'Dashboard' }).click();
    const row = page.locator('tbody tr', { hasText: 'CT046-3-2-SDM-T-39' });
    await row.getByText('Pending APSpace Entry').waitFor();
    const txt = await row.innerText();
    if (!txt.includes('May') || !txt.includes('2:00 PM')) throw new Error(txt);
    await page.screenshot({ path: `${SP}/12-dashboard.png`, fullPage: true });
  });
  await step('filters: tutor + APSpace status', async () => {
    await page.selectOption('#f-tutor', { label: 'May' });
    await page.selectOption('#f-aps', 'pending');
    await page.locator('tbody tr', { hasText: 'T-39' }).waitFor();
    if (!page.url().includes('tutorId=')) throw new Error('filter not in URL');
  });
  await step('export filtered CSV', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV (filtered)' }).click()]);
    const p = await dl.path();
    const csv = fs.readFileSync(p, 'utf8');
    const head = csv.split('\r\n')[0];
    if (!head.includes('Module,Tutorial Class,Group,Date,Time,Tutor,Student ID,Student Name,Status')) throw new Error(head);
    if (csv.split('\r\n').length < 15) throw new Error('too few rows');
  });
  await step('open detail, correct one student, audit updated', async () => {
    await page.locator('tbody tr', { hasText: 'T-39' }).first().getByRole('link', { name: 'View' }).click();
    await page.getByRole('heading', { name: 'CT046-3-2-SDM-T-39' }).waitFor();
    await page.getByRole('button', { name: 'Edit / Correct' }).click();
    const sel = page.locator('select[aria-label^="Status for"]').first();
    const current = await sel.inputValue();
    await sel.selectOption(current === 'present' ? 'absent' : 'present');
    await page.locator('input[aria-label^="Remark for"]').first().fill('Late medical certificate');
    await page.getByRole('button', { name: 'Save correction' }).click();
    await page.getByText(/Correction saved \(1 change\)/).waitFor();
    await page.getByText('Lecturer correction', { exact: true }).waitFor();
    await page.getByText('Attendance first saved', { exact: true }).waitFor();
  });
  await step('mark as Keyed into APSpace records time + lecturer', async () => {
    await page.getByRole('button', { name: 'Mark as Keyed into APSpace' }).click();
    await page.getByText('Marked as Keyed into APSpace.').waitFor();
    await page.getByText(/by Ms Aida/).first().waitFor();
    await page.screenshot({ path: `${SP}/13-detail.png`, fullPage: true });
  });
  await step('students page: add student into SDM-T-40', async () => {
    await page.getByRole('link', { name: 'Students' }).click();
    await page.fill('#s-tp', 'tp777001');
    await page.fill('#s-name', 'Test  Student Baru');
    await page.selectOption('#s-grp', { label: 'CT046-3-2-SDM-T-40' });
    await page.getByRole('button', { name: 'Add student' }).click();
    await page.getByText('Student Test Student Baru (TP777001) added to CT046-3-2-SDM-T-40.').waitFor();
  });
  await step('groups page shows counts and unassigned groups', async () => {
    await page.getByRole('link', { name: 'Tutorial Groups' }).click();
    const r40 = page.locator('tbody tr', { hasText: 'CT046-3-2-SDM-T-40' });
    await r40.waitFor();
    if (!(await r40.innerText()).includes('16')) throw new Error(await r40.innerText());
    await page.locator('tbody tr', { hasText: 'CT046-3-2-SDM-T-42' }).getByText('Unassigned – lecturer-controlled').waitFor();
    await page.screenshot({ path: `${SP}/14-groups.png`, fullPage: true });
  });
  await step('import CSV: preview then commit', async () => {
    await page.getByRole('link', { name: 'Import' }).click();
    await page.selectOption('#imp-module', { label: 'SDM (CT046-3-2-SDM)' });
    await page.setInputFiles('#imp-file', `${__dirname}/fixtures/roster.csv`);
    await page.getByText('Excluded – no tutorial group').waitFor();
    await page.getByRole('button', { name: 'Preview import' }).click();
    await page.getByText('2. Preview – nothing has been saved yet').waitFor();
    await page.screenshot({ path: `${SP}/15-import-preview.png`, fullPage: true });
    await page.getByRole('button', { name: /Commit import/ }).click();
    await page.getByText('Import completed').waitFor();
    const txt = await page.locator('.alert-ok').innerText();
    if (!/Students created\s*2/.test(txt)) throw new Error(txt);
  });
  await step('audit log page lists events', async () => {
    await page.getByRole('link', { name: 'Audit Log' }).click();
    await page.getByText('Roster import').first().waitFor();
    await page.selectOption('#audit-action', 'apspace_keyed');
    await page.getByText('Marked as Keyed into APSpace').first().waitFor();
  });
  await step('sign out', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(`${base}/`);
  });
  const real = errors.filter((e) => !/status of 4\d\d|401/.test(e));
  if (real.length) { console.log('console errors:', real); process.exitCode = 1; }
  await browser.close();
})().catch((e) => { console.error('✘', e.message); process.exit(1); });

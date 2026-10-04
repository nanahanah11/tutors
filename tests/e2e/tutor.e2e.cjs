const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs');
const SP = process.env.E2E_OUT;
const DB = process.env.E2E_DB;
const code = JSON.parse(fs.readFileSync(`${SP}/maycode.json`)).code;
// Tutor flow E2E (PRD §26.4 flows 1–4) against the local harness started by tests/e2e/run.sh
const base = 'http://localhost:5179';
(async () => {
  const browser = await chromium.launch({ executablePath: undefined });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const step = async (name, fn) => { await fn(); console.log('✔', name); };

  await step('protected route redirects to code entry', async () => {
    await page.goto(`${base}/tutor`);
    await page.waitForURL(`${base}/`);
    if (await page.getByText('TP9').count()) throw new Error('student data visible');
  });
  await step('code field has no placeholder example', async () => {
    const ph = await page.getByLabel('Tutor Code').getAttribute('placeholder');
    if (ph) throw new Error('placeholder: ' + ph);
  });
  await step('invalid code shows friendly error', async () => {
    await page.getByLabel('Tutor Code').fill('MAY000' === code ? 'MAY001' : 'MAY000');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByText('invalid or inactive').waitFor();
  });
  await step('valid code opens tutor home with only May classes', async () => {
    await page.getByLabel('Tutor Code').fill(code.toLowerCase());
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Welcome, May' }).waitFor();
    const txt = await page.locator('.class-list').innerText();
    if (!txt.includes('CT046-3-2-SDM-T-39') || !txt.includes('CT046-3-2-SDM-T-40') || txt.includes('T-41')) throw new Error(txt);
    await page.screenshot({ path: `${SP}/01-tutor-home.png`, fullPage: true });
  });
  await step('setup form: dropdown, date max today, time', async () => {
    await page.getByRole('link', { name: '+ New Attendance' }).click();
    const opts = await page.locator('#class option').allInnerTexts();
    if (opts.join('|') !== '— Select your class —|SDM – CT046-3-2-SDM-T-39|SDM – CT046-3-2-SDM-T-40') throw new Error(opts.join('|'));
    const max = await page.locator('#date').getAttribute('max');
    const val = await page.locator('#date').inputValue();
    if (max !== val) throw new Error(`date default ${val} max ${max}`);
    await page.selectOption('#class', { label: 'SDM – CT046-3-2-SDM-T-40' });
    await page.fill('#time', '10:45');
    await page.getByRole('button', { name: 'Continue to Attendance' }).click();
    await page.getByText('Any changes related to the student list, please let Ms Aida know ASAP.').first().waitFor();
  });
  await step('Save disabled while unmarked; search keeps selections', async () => {
    const save = page.getByRole('button', { name: 'Save Attendance' });
    if (!(await save.isDisabled())) throw new Error('save enabled with unmarked');
    const firstName = await page.locator('td.student-name').first().innerText();
    const tp = await page.locator('td.tp').nth(2).innerText();
    await page.getByLabel('Search student name or TP number').fill(tp.toLowerCase());
    if ((await page.locator('tbody tr').count()) !== 1) throw new Error('search by TP failed');
    await page.locator('tbody tr').first().getByText('Absent').click();
    await page.getByLabel('Search student name or TP number').fill('');
    if ((await page.locator('tbody tr').count()) !== 15) throw new Error('clear search failed');
    await page.getByRole('button', { name: 'Mark All Absent' }).click();
    if ((await page.locator('.stat.absent .stat-value').innerText()).trim() !== '15') throw new Error('mark all absent failed');
    await page.getByRole('button', { name: 'Mark All Present' }).click();
    // Mark All Present overrides; re-mark absent for 2 students
    await page.locator('tbody tr').nth(0).getByText('Absent').click();
    await page.locator('tbody tr').nth(2).getByText('Absent').click();
    await page.screenshot({ path: `${SP}/02-marking.png`, fullPage: true });
    if (await save.isDisabled()) throw new Error('save still disabled');
    console.log('   first student', firstName);
  });
  await step('confirmation shows summary and absentees; confirm saves', async () => {
    await page.getByRole('button', { name: 'Save Attendance' }).click();
    const dlg = page.locator('dialog.modal');
    await dlg.getByText('Absent students (2)').waitFor();
    await page.screenshot({ path: `${SP}/03-confirm.png` });
    await dlg.getByRole('button', { name: 'Confirm Save' }).click();
    await page.getByText('Attendance saved successfully').waitFor();
    await page.getByText('Present 13 / Absent 2 of 15').waitFor();
    await page.screenshot({ path: `${SP}/04-saved.png` });
  });
  await step('duplicate is redirected to the existing record', async () => {
    await page.goto(`${base}/tutor/attendance/new`);
    await page.selectOption('#class', { label: 'SDM – CT046-3-2-SDM-T-40' });
    await page.fill('#time', '10:45');
    await page.getByRole('button', { name: 'Continue to Attendance' }).click();
    await page.getByText('Attendance already exists for this class, date and time').waitFor();
    await page.getByRole('link', { name: 'Open and edit existing record' }).click();
    await page.getByRole('heading', { name: 'Edit attendance' }).waitFor();
    if (await page.getByText('Pending APSpace Entry').count()) throw new Error('APSpace badge visible to tutor');
  });
  await step('same-day edit saves changes', async () => {
    await page.locator('tbody tr').nth(0).getByText('Present').click();
    await page.getByRole('button', { name: 'Save Attendance' }).click();
    await page.locator('dialog.modal').getByRole('button', { name: 'Confirm Save' }).click();
    await page.getByRole('heading', { name: /Welcome, May/ }).waitFor();
    await page.getByText('Attendance updated successfully (1 change)').waitFor();
    if (!page.url().endsWith('/tutor')) throw new Error('not returned home: ' + page.url());
  });
  await step('after the class date the record is read-only', async () => {
    const { execSync } = require('child_process');
    execSync(`psql -X -q -d ${DB} -c "update attendance_sessions set class_date = class_date - 1 where tutor_name_snapshot = 'May'"`);
    await page.goto(`${base}/tutor`);
    await page.getByText('Read-only').first().waitFor();
    await page.screenshot({ path: `${SP}/05-readonly-home.png`, fullPage: true });
    await page.getByRole('link', { name: 'View' }).first().click();
    await page.getByRole('heading', { name: 'Attendance record' }).waitFor();
    if (!(await page.locator('input[type=radio]').first().isDisabled())) throw new Error('radios enabled');
    if (await page.getByRole('button', { name: 'Save Attendance' }).count()) throw new Error('save visible');
  });
  await step('mobile layout renders', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${SP}/06-mobile.png`, fullPage: false });
  });
  await step('sign out', async () => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(`${base}/`);
    await page.goto(`${base}/tutor`);
    await page.waitForURL(`${base}/`);
  });
  await step('lecturer login page renders', async () => {
    await page.goto(`${base}/lecturer`);
    await page.getByRole('heading', { name: 'Lecturer Login' }).waitFor();
    await page.screenshot({ path: `${SP}/07-lecturer-login.png` });
  });
  const real = errors.filter((e) => !/401|Unauthorized|status of 4\d\d/.test(e));
  if (real.length) { console.log('console errors:', real); process.exitCode = 1; }
  await browser.close();
})().catch((e) => { console.error('✘', e.message); process.exit(1); });

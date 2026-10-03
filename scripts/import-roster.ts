/**
 * Imports student rosters from the supplied XLSX workbooks or normalised CSV (PRD §18, §32.1 step 9).
 *
 *   npm run import:roster -- CT046_Student_List.xlsx AAPP003_ISWE_Student_List.xlsx            # preview only
 *   npm run import:roster -- CT046_Student_List.xlsx AAPP003_ISWE_Student_List.xlsx --commit   # write
 *   npm run import:roster -- other.xlsx --module CT046-3-2-SDM --sheet Students [--deactivate-missing] [--commit]
 *
 * Rows without a tutorial group are excluded and reported (FR-STU-010, BR-020).
 * The import is attributed to the lecturer profile in the audit trail.
 */
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import readExcelFile from 'read-excel-file/node';
import { adminClient, lecturerProfileId, parseArgs } from './_shared';
import { INITIAL_WORKBOOKS, parseCsv, parseRosterGrid, rowsForModule, type Cell } from '../src/shared/rosterImport';

/** Expected active counts from PRD §6.1.3 for the initial deployment (informational check). */
const EXPECTED: Record<string, Record<string, number>> = {
  'CT046-3-2-SDM': { '38': 44, '39': 35, '40': 42, '41': 46, '42': 11 },
  'AAPP003-4-2-ISWE': { '7': 40, '8': 40, '9': 39 },
};

const { flags, positional } = parseArgs(process.argv.slice(2));
if (positional.length === 0) {
  console.error('Usage: npm run import:roster -- <file.xlsx|file.csv> [...] [--module CODE] [--sheet NAME] [--deactivate-missing] [--commit]');
  process.exit(1);
}
const commit = flags.commit === true;
const db = adminClient();
const lecturer = await lecturerProfileId(db);
const { data: modules, error: mErr } = await db.from('modules').select('id, module_code');
if (mErr) throw mErr;

let failed = false;
for (const file of positional) {
  const name = basename(file);
  const known = INITIAL_WORKBOOKS[name];
  const moduleCode = (typeof flags.module === 'string' ? flags.module : known?.moduleCode)?.toUpperCase();
  const mod = modules?.find((m) => m.module_code === moduleCode);
  console.log(`\n=== ${name} ===`);
  if (!mod) {
    console.error(`✘ Unknown target module. Pass --module <code>. Known: ${modules?.map((m) => m.module_code).join(', ')}`);
    failed = true;
    continue;
  }

  let grid: Cell[][];
  if (/\.csv$/i.test(name)) grid = parseCsv(readFileSync(file, 'utf8'));
  else {
    const sheets = (await readExcelFile(file)) as Array<{ sheet: string; data: Cell[][] }>;
    const wanted = typeof flags.sheet === 'string' ? flags.sheet : known?.sheet;
    const s = sheets.find((x) => x.sheet === wanted) ?? sheets[0];
    console.log(`Worksheet: ${s.sheet}`);
    grid = s.data;
  }

  const parsed = parseRosterGrid(grid);
  const { rows, otherModule } = rowsForModule(parsed, mod.module_code);
  console.log(`Rows processed: ${parsed.totalDataRows}   valid: ${rows.length}   excluded (no group): ${parsed.excluded.length}   need correction: ${parsed.errors.length + otherModule.length}`);
  for (const e of parsed.excluded) console.log(`  excluded row ${e.row_no}: ${e.student_id} ${e.student_name} – ${e.reason}`);
  for (const e of [...parsed.errors, ...otherModule]) console.log(`  ✘ row ${e.row_no}: ${e.student_id} ${e.student_name} – ${e.reason}`);

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.group_number] = (counts[r.group_number] ?? 0) + 1;
  const expected = EXPECTED[mod.module_code];
  console.log('Students per tutorial group:');
  for (const g of Object.keys(counts).sort((a, b) => Number(a) - Number(b))) {
    const exp = expected?.[g];
    const flag = exp === undefined ? '' : exp === counts[g] ? '  ✔ matches PRD' : `  ! PRD expects ${exp}`;
    console.log(`  ${mod.module_code}-T-${g}: ${counts[g]}${flag}`);
  }

  const { data, error } = await db.rpc('api_admin_import_roster', {
    p_actor_profile_id: lecturer.id,
    p_module_id: mod.id,
    p_rows: rows,
    p_filename: name,
    p_dry_run: !commit,
    p_deactivate_missing: flags['deactivate-missing'] === true,
    p_excluded_rows: parsed.excluded.length,
  });
  if (error || data?.ok === false) {
    console.error(`✘ ${error?.message ?? data?.error}`);
    failed = true;
    continue;
  }
  console.log(`${commit ? '✔ Imported' : 'Preview (nothing written)'}: students created ${data.students_created}, updated ${data.students_updated}, ` +
    `unchanged ${data.students_unchanged}; enrolments created ${data.enrolments_created}, moved ${data.enrolments_moved}, ` +
    `reactivated ${data.enrolments_reactivated}, deactivated ${data.enrolments_deactivated}; server errors ${data.errors.length}`);
  for (const e of data.errors) console.log(`  ✘ row ${e.row}: ${e.student_id} – ${e.error}`);
}
if (!commit) console.log('\nRe-run with --commit to write the import.');
process.exit(failed ? 1 : 0);

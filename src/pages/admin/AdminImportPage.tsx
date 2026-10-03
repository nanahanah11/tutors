/** Lecturer: student roster import from XLSX/CSV with preview and summary (§18, FR-STU-008..010). */
import { useEffect, useState } from 'react';
import { lecturerApi, type ImportSummary } from '../../services/lecturerApi';
import type { Module } from '../../types/db';
import {
  INITIAL_WORKBOOKS,
  parseCsv,
  parseRosterGrid,
  rowsForModule,
  type Cell,
  type RosterIssue,
  type RosterParseResult,
} from '../../shared/rosterImport';
import { Alert, Spinner } from '../../components/ui';

type Sheet = { sheet: string; data: Cell[][] };

export default function AdminImportPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [parsed, setParsed] = useState<RosterParseResult | null>(null);
  const [otherModule, setOtherModule] = useState<RosterIssue[]>([]);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [deactivateMissing, setDeactivateMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    lecturerApi.modules().then(setModules).catch((e) => setError(e.message));
    lecturerApi.importBatches().then(setBatches).catch(() => {});
  }, []);

  const module = modules.find((m) => m.id === moduleId);

  async function onFile(f: File | null) {
    setFile(f);
    setSheets([]);
    setParsed(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (!f) return;
    try {
      let all: Sheet[];
      if (/\.csv$/i.test(f.name)) {
        all = [{ sheet: 'CSV', data: parseCsv(await f.text()) }];
      } else if (/\.xlsx$/i.test(f.name)) {
        const { default: readExcelFile } = await import('read-excel-file/browser');
        all = (await readExcelFile(f)) as Sheet[];
      } else {
        throw new Error('Please choose a .xlsx or .csv file.');
      }
      setSheets(all);
      const known = INITIAL_WORKBOOKS[f.name];
      if (known) {
        const m = modules.find((x) => x.module_code === known.moduleCode);
        if (m) setModuleId(m.id);
      }
      const preferred = all.find((s) => s.sheet === known?.sheet) ?? all.find((s) => ['Students', 'Roster'].includes(s.sheet)) ?? all[0];
      setSheetName(preferred?.sheet ?? '');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Re-parse when sheet/module changes
  useEffect(() => {
    setPreview(null);
    setResult(null);
    const s = sheets.find((x) => x.sheet === sheetName);
    if (!s) return setParsed(null);
    try {
      const r = parseRosterGrid(s.data);
      setParsed(r);
      setError(null);
    } catch (e) {
      setParsed(null);
      setError((e as Error).message);
    }
  }, [sheets, sheetName, moduleId]);

  const scoped = parsed && module ? rowsForModule(parsed, module.module_code) : null;
  useEffect(() => setOtherModule(scoped?.otherModule ?? []), [parsed, module]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runImport(dryRun: boolean) {
    if (!scoped || !module || !file || !parsed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await lecturerApi.importRoster({
        moduleId: module.id,
        rows: scoped.rows,
        filename: file.name,
        dryRun,
        deactivateMissing,
        excludedRows: parsed.excluded.length,
      });
      if (dryRun) setPreview(r);
      else {
        setResult(r);
        setPreview(null);
        lecturerApi.importBatches().then(setBatches).catch(() => {});
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const correction = parsed ? [...parsed.errors, ...otherModule] : [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Student Roster Import</h1>
          <p>Upload the module workbook (Name, Student ID, Tutorial Group) or the normalised CSV. Modules and tutorial groups must already exist.</p>
        </div>
      </div>
      {error && <Alert kind="error">{error}</Alert>}

      <section className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="imp-file">File (.xlsx or .csv)</label>
            <input id="imp-file" type="file" accept=".xlsx,.csv" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="field">
            <label htmlFor="imp-module">Target module</label>
            <select id="imp-module" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              <option value="">Select…</option>
              {modules.map((m) => <option key={m.id} value={m.id}>{m.short_name} ({m.module_code})</option>)}
            </select>
          </div>
          {sheets.length > 1 && (
            <div className="field">
              <label htmlFor="imp-sheet">Worksheet</label>
              <select id="imp-sheet" value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
                {sheets.map((s) => <option key={s.sheet} value={s.sheet}>{s.sheet}</option>)}
              </select>
            </div>
          )}
        </div>
        <p className="small muted">
          Known workbooks are mapped automatically: CT046_Student_List.xlsx → CT046-3-2-SDM (sheet “Students”), AAPP003_ISWE_Student_List.xlsx →
          AAPP003-4-2-ISWE (sheet “Roster”). Assignment Group and GROUP/TOTAL helper cells are ignored.
        </p>
      </section>

      {parsed && (
        <section className="card" aria-labelledby="prev-h">
          <h2 id="prev-h">1. File check</h2>
          <dl className="kv">
            <dt>Header row</dt><dd>{parsed.headerRow}</dd>
            <dt>Rows processed</dt><dd>{parsed.totalDataRows}</dd>
            <dt>Valid rows</dt><dd>{scoped?.rows.length ?? parsed.rows.length}</dd>
            <dt>Excluded – no tutorial group</dt><dd>{parsed.excluded.length}</dd>
            <dt>Rows requiring correction</dt><dd>{correction.length}</dd>
            <dt>Students per group</dt>
            <dd>{groupSummary(scoped?.rows ?? parsed.rows) || '—'}</dd>
          </dl>
          {parsed.excluded.length > 0 && <IssueTable title="Excluded rows (no tutorial group – never silently assigned)" issues={parsed.excluded} />}
          {correction.length > 0 && <IssueTable title="Rows requiring correction (not imported)" issues={correction} />}

          {!module ? (
            <Alert kind="warn">Select the target module to continue.</Alert>
          ) : (
            <>
              <label className="check" style={{ margin: '0.75rem 0' }}>
                <input type="checkbox" checked={deactivateMissing} onChange={(e) => setDeactivateMissing(e.target.checked)} />
                Deactivate {module.short_name} enrolments for students not in this file (semester rollover / withdrawn students)
              </label>
              <div className="row">
                <button type="button" className="btn btn-primary" disabled={busy || !scoped?.rows.length} onClick={() => runImport(true)}>
                  Preview import
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {busy && <Spinner label="Working…" />}

      {preview && (
        <section className="card" aria-labelledby="dry-h">
          <h2 id="dry-h">2. Preview – nothing has been saved yet</h2>
          <Summary s={preview} excluded={parsed?.excluded.length ?? 0} />
          <div className="row">
            <button type="button" className="btn btn-success btn-lg" disabled={busy} onClick={() => runImport(false)}>
              Commit import to {preview.module_code}
            </button>
            <button type="button" className="btn" onClick={() => setPreview(null)}>Cancel</button>
          </div>
        </section>
      )}

      {result && (
        <Alert kind="ok" title="Import completed">
          <Summary s={result} excluded={parsed?.excluded.length ?? 0} />
        </Alert>
      )}

      {batches.length > 0 && (
        <section className="card">
          <h2>Recent imports</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>File</th><th className="num">Rows</th><th className="num">Created</th><th className="num">Updated</th><th className="num">Enrolments</th><th className="num">Excluded</th><th className="num">Errors</th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={String(b.id)}>
                    <td>{new Date(String(b.uploaded_at)).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })}</td>
                    <td>{String(b.filename ?? '')}</td>
                    <td className="num">{String(b.total_rows)}</td>
                    <td className="num">{String(b.students_created)}</td>
                    <td className="num">{String(b.students_updated)}</td>
                    <td className="num">{String(b.enrolments_created)}</td>
                    <td className="num">{String(b.excluded_rows)}</td>
                    <td className="num">{String(b.failed_rows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function groupSummary(rows: Array<{ group_number: string }>): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.group_number, (counts.get(r.group_number) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([g, n]) => `${g} (${n})`)
    .join(', ');
}

function Summary({ s, excluded }: { s: ImportSummary; excluded: number }) {
  return (
    <>
      <dl className="kv">
        <dt>Rows sent</dt><dd>{s.rows_processed}</dd>
        <dt>Students created</dt><dd>{s.students_created}</dd>
        <dt>Students updated</dt><dd>{s.students_updated}</dd>
        <dt>Students unchanged</dt><dd>{s.students_unchanged}</dd>
        <dt>Enrolments created</dt><dd>{s.enrolments_created}</dd>
        <dt>Enrolments reactivated</dt><dd>{s.enrolments_reactivated}</dd>
        <dt>Students moved between groups</dt><dd>{s.enrolments_moved}</dd>
        <dt>Enrolments deactivated</dt><dd>{s.enrolments_deactivated}</dd>
        <dt>Rows excluded (no tutorial group)</dt><dd>{excluded}</dd>
        <dt>Errors</dt><dd>{s.errors.length}</dd>
      </dl>
      {s.errors.length > 0 && (
        <IssueTable
          title="Rows rejected by the server"
          issues={s.errors.map((e) => ({ row_no: e.row, student_id: e.student_id, student_name: '', reason: e.error }))}
        />
      )}
    </>
  );
}

function IssueTable({ title, issues }: { title: string; issues: RosterIssue[] }) {
  return (
    <details style={{ marginBottom: '0.75rem' }} open={issues.length <= 10}>
      <summary><strong>{title}</strong> ({issues.length})</summary>
      <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
        <table>
          <thead><tr><th className="num">Row</th><th>Student ID</th><th>Name</th><th>Reason</th></tr></thead>
          <tbody>
            {issues.map((i, k) => (
              <tr key={k}><td className="num">{i.row_no}</td><td className="mono">{i.student_id}</td><td>{i.student_name}</td><td>{i.reason}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Lecturer session detail, correction, APSpace status, export, print and audit (§9.11, §11.7). */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lecturerApi } from '../services/lecturerApi';
import type { AuditLog, RecordDetail, SessionSummary, Student } from '../types/db';
import type { AttendanceStatus } from '../shared/roster';
import { formatDate, formatTime, formatTimestamp } from '../shared/time';
import { Alert, ApspaceBadge, Modal, Spinner, Stat, StatusBadge, downloadText } from '../components/ui';
import { attendanceCsv, exportFilename } from '../utils/exportCsv';

interface EditRow {
  student_uuid: string;
  student_id: string;
  student_name: string;
  status: AttendanceStatus | '';
  remark: string;
  isNew?: boolean;
}

export default function AttendanceDetailPage() {
  const { sessionId = '' } = useParams();
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [records, setRecords] = useState<RecordDetail[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [missing, setMissing] = useState<Student[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r, a] = await Promise.all([
        lecturerApi.session(sessionId),
        lecturerApi.sessionRecords([sessionId]),
        lecturerApi.sessionAudit(sessionId),
      ]);
      setSession(s);
      setRecords(r);
      setAudit(a);
      if (!s) setError('Session not found.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(
    () => [...records].sort((a, b) => a.student_name.localeCompare(b.student_name, 'en', { sensitivity: 'base' })),
    [records],
  );

  async function startEdit() {
    if (!session) return;
    setRows(
      sorted.map((r) => ({
        student_uuid: r.student_uuid,
        student_id: r.student_id,
        student_name: r.student_name,
        status: r.status,
        remark: r.remark ?? '',
      })),
    );
    try {
      setMissing(await lecturerApi.enrolledNotRecorded(session.tutorial_group_id, records.map((r) => r.student_uuid)));
    } catch {
      setMissing([]);
    }
    setEditing(true);
    setNotice(null);
  }

  async function saveCorrection() {
    if (!session) return;
    if (rows.some((r) => !r.status)) {
      setError('Every student in the correction must be marked Present or Absent.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await lecturerApi.correct(
        session.id,
        rows.map((r) => ({ student_id: r.student_uuid, status: r.status as AttendanceStatus, remark: r.remark.trim() || null })),
      );
      setEditing(false);
      setNotice(res.changed ? `Correction saved (${res.changed} change${res.changed === 1 ? '' : 's'}). The audit trail has been updated.` : 'No changes were made.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setApspace(status: 'keyed_in' | 'pending') {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await lecturerApi.setApspace([session.id], status);
      setNotice(status === 'keyed_in' ? 'Marked as Keyed into APSpace.' : 'Reverted to Pending APSpace Entry.');
      setConfirmRevert(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (!session) {
    return (
      <div className="narrow">
        <Alert kind="error">{error ?? 'Session not found.'}</Alert>
        <Link to="/lecturer" className="btn">Back to dashboard</Link>
      </div>
    );
  }

  const updateRow = (i: number, patch: Partial<EditRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="no-print"><Link to="/lecturer">← Back to dashboard</Link></p>
          <h1>{session.tutorial_code}</h1>
          <p>{session.module_name} ({session.module_code})</p>
        </div>
        <div className="row no-print">
          <button type="button" className="btn" onClick={() => downloadText(exportFilename(`${session.tutorial_code}-${session.class_date}`), attendanceCsv(records))}>
            Export CSV
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>Print</button>
          {!editing && <button type="button" className="btn" onClick={startEdit}>Edit / Correct</button>}
          {session.apspace_status === 'pending' ? (
            <button type="button" className="btn btn-success" disabled={busy} onClick={() => setApspace('keyed_in')}>
              Mark as Keyed into APSpace
            </button>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirmRevert(true)}>
              Revert to Pending
            </button>
          )}
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}

      <section className="card">
        <dl className="kv" style={{ gridTemplateColumns: 'max-content 1fr max-content 1fr' }}>
          <dt>Module</dt><dd>{session.module_short_name} – {session.module_code}</dd>
          <dt>Tutorial group</dt><dd>{session.tutorial_code} (Group {session.group_number})</dd>
          <dt>Date</dt><dd>{formatDate(session.class_date)}</dd>
          <dt>Start time</dt><dd>{formatTime(session.class_time)}</dd>
          <dt>Tutor name</dt><dd>{session.tutor_name_snapshot}</dd>
          <dt>Tutor code / profile</dt>
          <dd>
            <span className="mono">{session.tutor_code_prefix ? `${session.tutor_code_prefix}###` : '—'}</span>{' '}
            <span className="small muted mono" title="Tutor profile ID">{session.tutor_profile_id}</span>
          </dd>
          <dt>Saved</dt><dd>{formatTimestamp(session.saved_at)}</dd>
          <dt>Last updated</dt><dd>{formatTimestamp(session.updated_at)}</dd>
          <dt>Last tutor edit</dt><dd>{formatTimestamp(session.last_tutor_edit_at)}</dd>
          <dt>Last lecturer correction</dt><dd>{formatTimestamp(session.last_lecturer_edit_at)}</dd>
          <dt>APSpace status</dt><dd><ApspaceBadge status={session.apspace_status} /></dd>
          <dt>Keyed in</dt>
          <dd>{session.apspace_keyed_at ? `${formatTimestamp(session.apspace_keyed_at)} by ${session.apspace_keyed_by_name ?? '—'}` : '—'}</dd>
        </dl>
      </section>

      <div className="stats">
        <Stat label="Total students" value={session.total_students} />
        <Stat label="Present" value={session.present_count} tone="present" />
        <Stat label="Absent" value={session.absent_count} tone="absent" />
      </div>

      {!editing ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Student ID</th>
                <th scope="col">Student Name</th>
                <th scope="col">Status</th>
                <th scope="col">Remark</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id}>
                  <td className="num">{i + 1}</td>
                  <td className="mono">{r.student_id}</td>
                  <td>{r.student_name}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="card" aria-labelledby="correct-h">
          <h2 id="correct-h">Correct attendance</h2>
          <p className="muted">Lecturer corrections are allowed at any time and are recorded in the audit trail.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Student ID</th>
                  <th scope="col">Student Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Remark</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.student_uuid}>
                    <td className="mono">{r.student_id}</td>
                    <td>
                      {r.student_name} {r.isNew && <span className="badge badge-neutral">added</span>}
                    </td>
                    <td>
                      <select
                        aria-label={`Status for ${r.student_name}`}
                        value={r.status}
                        onChange={(e) => updateRow(i, { status: e.target.value as AttendanceStatus })}
                      >
                        <option value="" disabled>Select…</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`Remark for ${r.student_name}`}
                        value={r.remark}
                        maxLength={500}
                        onChange={(e) => updateRow(i, { remark: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missing.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h3>Enrolled students not in this session</h3>
              <p className="small muted">Students added to the group after the session was saved. Add them if they should be recorded.</p>
              <div className="row">
                {missing
                  .filter((m) => !rows.some((r) => r.student_uuid === m.id))
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        setRows([...rows, { student_uuid: m.id, student_id: m.student_id, student_name: m.full_name, status: '', remark: '', isNew: true }])
                      }
                    >
                      + {m.full_name} ({m.student_id})
                    </button>
                  ))}
              </div>
            </div>
          )}
          <div className="row end" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveCorrection} disabled={busy}>
              {busy ? 'Saving…' : 'Save correction'}
            </button>
          </div>
        </section>
      )}

      <section className="card no-print" style={{ marginTop: '1.5rem' }} aria-labelledby="audit-h">
        <h2 id="audit-h">Audit trail</h2>
        <AuditList logs={audit} />
      </section>

      <Modal
        open={confirmRevert}
        title="Revert to Pending APSpace Entry?"
        onClose={() => setConfirmRevert(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirmRevert(false)}>Cancel</button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setApspace('pending')}>Revert</button>
          </>
        }
      >
        <p>Use this only if the session was marked as keyed in by mistake. The change will be recorded in the audit trail.</p>
      </Modal>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  save: 'Attendance first saved',
  tutor_edit: 'Same-day tutor edit',
  lecturer_correct: 'Lecturer correction',
  apspace_keyed: 'Marked as Keyed into APSpace',
  apspace_reverted: 'Reverted to Pending APSpace Entry',
  roster_change: 'Roster change',
  roster_import: 'Roster import',
  tutor_assignment_change: 'Tutor assignment change',
  tutor_code_generated: 'Tutor code generated',
  tutor_profile_change: 'Tutor profile change',
  master_data_change: 'Module / group change',
};

export function AuditList({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) return <p className="muted">No audit events.</p>;
  return (
    <ul className="audit-list">
      {logs.map((l) => {
        const changes = (l.new_values?.changes as Array<Record<string, string | null>> | undefined) ?? null;
        return (
          <li key={l.id}>
            <div className="row" style={{ gap: '0.5rem' }}>
              <strong>{ACTION_LABELS[l.action] ?? l.action}</strong>
              <span className="muted small">
                {formatTimestamp(l.created_at)} · by {l.actor_name ?? 'system'}
              </span>
            </div>
            {changes ? (
              <ul className="audit-changes">
                {changes.map((c, i) => (
                  <li key={i}>
                    {c.student_name} ({c.student_id}): {c.old_status ?? 'not recorded'} → <strong>{c.new_status}</strong>
                    {c.remark !== c.old_remark && c.remark ? ` · remark “${c.remark}”` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <AuditValues log={l} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function AuditValues({ log }: { log: AuditLog }) {
  const v = log.new_values ?? log.old_values;
  if (!v) return null;
  const entries = Object.entries(v).filter(([k]) => !['id', 'created_at'].includes(k));
  if (entries.length === 0) return null;
  return (
    <div className="small muted" style={{ marginTop: '0.25rem' }}>
      {entries
        .slice(0, 10)
        .map(([k, val]) => {
          const old = log.old_values?.[k];
          const changed = log.old_values && log.new_values && old !== undefined && JSON.stringify(old) !== JSON.stringify(val);
          return `${k}: ${changed ? `${JSON.stringify(old)} → ` : ''}${JSON.stringify(val)}`;
        })
        .join(' · ')}
    </div>
  );
}

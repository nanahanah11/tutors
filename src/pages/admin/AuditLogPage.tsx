/** Lecturer: audit log viewer (FR-AUD-005). Read-only. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lecturerApi } from '../../services/lecturerApi';
import type { AuditLog } from '../../types/db';
import { Alert, Spinner } from '../../components/ui';
import { AuditList } from '../AttendanceDetailPage';

const ACTIONS = [
  ['', 'All events'],
  ['save', 'Attendance saved'],
  ['tutor_edit', 'Tutor edits'],
  ['lecturer_correct', 'Lecturer corrections'],
  ['apspace_keyed', 'APSpace keyed in'],
  ['apspace_reverted', 'APSpace reverted'],
  ['roster_change', 'Roster changes'],
  ['roster_import', 'Roster imports'],
  ['tutor_assignment_change', 'Tutor assignments'],
  ['tutor_code_generated', 'Tutor codes'],
  ['tutor_profile_change', 'Tutor profiles'],
  ['master_data_change', 'Modules / groups'],
];

export default function AuditLogPage() {
  const [action, setAction] = useState('');
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLogs(null);
    lecturerApi.auditLogs(action || undefined).then(setLogs).catch((e) => setError(e.message));
  }, [action]);

  return (
    <div>
      <div className="page-head"><div><h1>Audit Log</h1><p>Append-only record of attendance, roster and access changes (latest 200).</p></div></div>
      <div className="card">
        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="audit-action">Event type</label>
          <select id="audit-action" value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        {!logs ? <Spinner /> : <AuditList logs={logs} />}
        {logs && logs.some((l) => l.session_id) && (
          <p className="small muted">Open a session from the <Link to="/lecturer">dashboard</Link> to see its full audit trail.</p>
        )}
      </div>
    </div>
  );
}

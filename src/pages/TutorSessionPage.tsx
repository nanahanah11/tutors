/** Re-open own attendance: editable only on the class date in Malaysia time (FR-SAVE-005..007). */
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTutor } from '../hooks/useTutor';
import { tutorApi, ApiError } from '../services/tutorApi';
import { errorMessage } from '../shared/errors';
import { buildRecordsPayload, countAttendance, validateAttendance, type Marks, type RosterStudent } from '../shared/roster';
import { formatDate, formatTime, formatTimestamp, msUntilEditWindowCloses } from '../shared/time';
import type { TutorSession } from '../types/db';
import { Alert, Spinner } from '../components/ui';
import { AttendanceMarker } from '../components/attendance/AttendanceMarker';
import { RosterNotice } from '../components/attendance/RosterNotice';
import { SaveConfirmation } from '../components/attendance/SaveConfirmation';
import { classLabel } from './NewAttendancePage';

export default function TutorSessionPage() {
  const { sessionId = '' } = useParams();
  const { ctx } = useTutor();
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<TutorSession | null>(null);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [marks, setMarks] = useState<Marks>({});
  const [remarks, setRemarks] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [editable, setEditable] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const message = (location.state as { justSaved?: boolean } | null)?.justSaved ? 'Attendance saved successfully.' : null;

  const load = useCallback(async () => {
    try {
      const r = await tutorApi.session(sessionId);
      setSession(r.session);
      setEditable(r.session.tutor_editable);
      setStudents(r.students.map(({ id, student_id, full_name }) => ({ id, student_id, full_name })));
      const m: Marks = {};
      const rm: Record<string, string | undefined> = {};
      for (const s of r.students) {
        if (s.status) m[s.id] = s.status;
        if (s.remark) rm[s.id] = s.remark;
      }
      setMarks(m);
      setRemarks(rm);
      setError(null);
    } catch (e) {
      setError(errorMessage(e instanceof ApiError ? e.code : undefined));
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Lock the screen automatically at 12:00 AM Malaysia time (the server enforces this too).
  useEffect(() => {
    if (!session || !editable) return;
    const ms = msUntilEditWindowCloses(session.class_date);
    const t = setTimeout(() => setEditable(false), Math.max(ms, 0) + 500);
    return () => clearTimeout(t);
  }, [session, editable]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await tutorApi.update(sessionId, buildRecordsPayload(students, marks, remarks));
      setConfirmOpen(false);
      // After a successful edit, return to the tutor home screen.
      navigate('/tutor', {
        replace: true,
        state: {
          flash:
            r.changed > 0
              ? `Attendance updated successfully (${r.changed} change${r.changed === 1 ? '' : 's'}).`
              : 'No changes were made to the attendance.',
        },
      });
      return;
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'SERVER_ERROR';
      if (code === 'EDIT_WINDOW_CLOSED') setEditable(false);
      setError(`${errorMessage(code)}${code === 'NETWORK_ERROR' || code === 'SERVER_ERROR' ? ' Your changes are still on this page.' : ''}`);
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!ctx) return null;
  if (!session && !error) return <Spinner />;
  if (!session) {
    return (
      <div className="narrow">
        <Alert kind="error">{error}</Alert>
        <Link to="/tutor" className="btn">Back to Home</Link>
      </div>
    );
  }

  const counts = countAttendance(students, marks);
  const problems = validateAttendance(
    { tutorial_group_id: session.tutorial_group_id, class_date: session.class_date, class_time: session.class_time },
    students,
    marks,
  );

  return (
    <div>
      <section className="card" aria-label="Session details">
        <div className="card-header">
          <h1 style={{ margin: 0 }}>{editable ? 'Edit attendance' : 'Attendance record'}</h1>
        </div>
        <div className="marking-head">
          <div><span>Tutor</span><strong>{session.tutor_name}</strong></div>
          <div><span>Class / Subject</span><strong>{classLabel(session)}</strong></div>
          <div><span>Class date</span><strong>{formatDate(session.class_date)}</strong></div>
          <div><span>Class time</span><strong>{formatTime(session.class_time)}</strong></div>
          <div><span>Saved</span><strong>{formatTimestamp(session.saved_at)}</strong></div>
          <div><span>Last updated</span><strong>{formatTimestamp(session.updated_at)}</strong></div>
        </div>
      </section>

      {message && <Alert kind="ok">{message}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {editable ? (
        <Alert>
          You can edit this attendance until 11:59 PM today (Malaysia time). After that it becomes read-only and any correction
          must be made by Ms Aida.
        </Alert>
      ) : (
        <Alert kind="warn" title="Read-only">
          The same-day edit window for this class has closed. Please contact Ms Aida if a correction is needed.
        </Alert>
      )}
      <RosterNotice />

      <AttendanceMarker
        students={students}
        marks={marks}
        onMarksChange={setMarks}
        remarks={remarks}
        onRemarksChange={editable ? setRemarks : undefined}
        readOnly={!editable}
      />

      {editable && (
        <div className="sticky-bar">
          <span aria-live="polite">
            {counts.unmarked > 0 ? (
              <strong style={{ color: 'var(--pending)' }}>{counts.unmarked} still unmarked</strong>
            ) : (
              `Present ${counts.present} · Absent ${counts.absent}`
            )}
          </span>
          <span className="spacer" />
          <Link to="/tutor" className="btn">Cancel</Link>
          <button type="button" className="btn btn-primary btn-lg" disabled={problems.length > 0 || saving} onClick={() => setConfirmOpen(true)}>
            Save Attendance
          </button>
        </div>
      )}

      <SaveConfirmation
        open={confirmOpen}
        isEdit
        classLabel={classLabel(session)}
        classDate={session.class_date}
        classTime={session.class_time}
        tutorName={session.tutor_name}
        students={students}
        marks={marks}
        saving={saving}
        onBack={() => setConfirmOpen(false)}
        onConfirm={save}
      />
    </div>
  );
}

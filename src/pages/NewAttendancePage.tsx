/** New attendance: session setup (§11.3) -> marking (§11.4) -> confirmation (§11.5). */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTutor } from '../hooks/useTutor';
import { tutorApi, ApiError } from '../services/tutorApi';
import { errorMessage } from '../shared/errors';
import { buildRecordsPayload, countAttendance, validateAttendance, type Marks, type RosterStudent } from '../shared/roster';
import { formatDate, formatTime, isValidTime, malaysiaToday } from '../shared/time';
import type { TutorClass, TutorSession } from '../types/db';
import { Alert, Spinner } from '../components/ui';
import { AttendanceMarker } from '../components/attendance/AttendanceMarker';
import { RosterNotice } from '../components/attendance/RosterNotice';
import { SaveConfirmation } from '../components/attendance/SaveConfirmation';

type Step = 'setup' | 'marking' | 'saved';
type Duplicate = { session_id: string; recorded_by?: string; own?: boolean; tutor_editable?: boolean };

export function classLabel(c: Pick<TutorClass, 'module_short_name' | 'tutorial_code'>) {
  return `${c.module_short_name} – ${c.tutorial_code}`;
}

export default function NewAttendancePage() {
  const { ctx } = useTutor();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('setup');
  const today = ctx?.today ?? malaysiaToday();
  const [groupId, setGroupId] = useState(ctx?.classes.length === 1 ? ctx.classes[0].tutorial_group_id : '');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);
  const [loading, setLoading] = useState(false);

  const [students, setStudents] = useState<RosterStudent[] | null>(null);
  const [marks, setMarks] = useState<Marks>({});
  const [remarks, setRemarks] = useState<Record<string, string | undefined>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<TutorSession | null>(null);
  const hadNetworkError = useRef(false);

  const cls = useMemo(() => ctx?.classes.find((c) => c.tutorial_group_id === groupId), [ctx, groupId]);
  const counts = students ? countAttendance(students, marks) : null;
  const dirty = step === 'marking' && Object.keys(marks).length > 0;

  // Warn before leaving with unsaved marks
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (!ctx) return null;

  async function continueToAttendance(e: FormEvent) {
    e.preventDefault();
    setSetupError(null);
    setDuplicate(null);
    if (!groupId) return setSetupError('Select a Class / Subject.');
    if (!date) return setSetupError('Select the class date.');
    if (date > today) return setSetupError(errorMessage('FUTURE_DATE'));
    if (!time || !isValidTime(time)) return setSetupError('Enter the class time.');
    setLoading(true);
    try {
      const dup = await tutorApi.lookup(groupId, date, time);
      if (dup.exists && dup.session_id) {
        setDuplicate(dup as Duplicate);
        return;
      }
      const r = await tutorApi.roster(groupId);
      setStudents(r.students);
      setMarks({});
      setRemarks({});
      setStep('marking');
    } catch (err) {
      setSetupError(errorMessage(err instanceof ApiError ? err.code : undefined));
    } finally {
      setLoading(false);
    }
  }

  async function confirmSave() {
    if (saving || !students) return; // prevent double submission
    setSaving(true);
    setSaveError(null);
    try {
      const res = await tutorApi.create({
        tutorial_group_id: groupId,
        class_date: date,
        class_time: time,
        records: buildRecordsPayload(students, marks, remarks),
      });
      setSaved(res.session);
      setConfirmOpen(false);
      setStep('saved');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError('SERVER_ERROR', 500);
      if (e.code === 'DUPLICATE_SESSION' && hadNetworkError.current && e.data.existing_session_id) {
        // An earlier attempt reached the server before the connection dropped – it is saved.
        navigate(`/tutor/attendance/${e.data.existing_session_id}`, { replace: true, state: { justSaved: true } });
        return;
      }
      if (e.code === 'NETWORK_ERROR') hadNetworkError.current = true;
      if (e.code === 'DUPLICATE_SESSION') {
        setDuplicate({ session_id: String(e.data.existing_session_id) });
      }
      setSaveError(errorMessage(e.code));
      setConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------ saved
  if (step === 'saved' && saved) {
    return (
      <div className="narrow">
        <Alert kind="ok" title="Attendance saved successfully">
          <p>
            {classLabel(saved)} · {formatDate(saved.class_date)} {formatTime(saved.class_time)} · Present{' '}
            {saved.present_count} / Absent {saved.absent_count} of {saved.total_students}.
          </p>
          {saved.tutor_editable ? (
            <p>
              You may edit this attendance only until the end of the class date ({formatDate(saved.class_date)}, 11:59 PM
              Malaysia time). After that, please contact Ms Aida for any correction.
            </p>
          ) : (
            <p>The class date has already passed, so this record is now read-only. Please contact Ms Aida for any correction.</p>
          )}
        </Alert>
        <div className="row">
          <Link to="/tutor" className="btn btn-primary">Back to Home</Link>
          {saved.tutor_editable && (
            <Link to={`/tutor/attendance/${saved.id}`} className="btn">Edit this attendance</Link>
          )}
          <button type="button" className="btn" onClick={() => window.location.assign('/tutor/attendance/new')}>
            Record another class
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ marking
  if (step === 'marking' && students && cls) {
    const problems = validateAttendance({ tutorial_group_id: groupId, class_date: date, class_time: time }, students, marks);
    return (
      <div>
        <section className="card" aria-label="Session details">
          <div className="marking-head">
            <div><span>Tutor</span><strong>{ctx.tutor.full_name}</strong></div>
            <div><span>Class / Subject</span><strong>{classLabel(cls)}</strong></div>
            <div><span>Class date</span><strong>{formatDate(date)}</strong></div>
            <div><span>Class time</span><strong>{formatTime(time)}</strong></div>
          </div>
          <div className="row" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-sm" onClick={() => setStep('setup')}>
              ← Change class, date or time
            </button>
          </div>
        </section>

        <RosterNotice />
        {date !== today && (
          <Alert kind="warn">
            The class date is not today. Once saved, this record will be read-only for tutors – check carefully before saving.
          </Alert>
        )}
        {saveError && (
          <Alert
            kind="error"
            title="Attendance was NOT saved"
            action={
              duplicate ? (
                <Link className="btn btn-sm" to={`/tutor/attendance/${duplicate.session_id}`}>Open existing record</Link>
              ) : (
                <button type="button" className="btn btn-sm btn-primary" onClick={confirmSave} disabled={saving}>
                  Retry save
                </button>
              )
            }
          >
            {saveError} Your selections are still on this page.
          </Alert>
        )}

        {students.length === 0 ? (
          <Alert kind="warn">{errorMessage('EMPTY_ROSTER')}</Alert>
        ) : (
          <AttendanceMarker
            students={students}
            marks={marks}
            onMarksChange={setMarks}
            remarks={remarks}
            onRemarksChange={setRemarks}
          />
        )}

        <div className="sticky-bar">
          <span aria-live="polite">
            {counts && counts.unmarked > 0 ? (
              <strong style={{ color: 'var(--pending)' }}>
                {counts.unmarked} student{counts.unmarked === 1 ? ' is' : 's are'} still unmarked
              </strong>
            ) : (
              <span>All {counts?.total} students marked.</span>
            )}
          </span>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={problems.length > 0 || saving}
            title={problems.join(' ')}
            onClick={() => setConfirmOpen(true)}
          >
            Save Attendance
          </button>
        </div>

        <SaveConfirmation
          open={confirmOpen}
          classLabel={classLabel(cls)}
          classDate={date}
          classTime={time}
          tutorName={ctx.tutor.full_name}
          students={students}
          marks={marks}
          saving={saving}
          onBack={() => setConfirmOpen(false)}
          onConfirm={confirmSave}
        />
      </div>
    );
  }

  // ------------------------------------------------------------------ setup
  return (
    <div className="narrow">
      <h1>New Attendance</h1>
      <p className="muted">Tutor: <strong>{ctx.tutor.full_name}</strong></p>
      {ctx.classes.length === 0 && <Alert kind="warn">You have no tutorial classes assigned. Please contact Ms Aida.</Alert>}
      {setupError && <Alert kind="error">{setupError}</Alert>}
      {duplicate && (
        <Alert
          kind="warn"
          title="Attendance already exists for this class, date and time"
          action={
            duplicate.own ? (
              <Link to={`/tutor/attendance/${duplicate.session_id}`} className="btn btn-sm btn-primary">
                {duplicate.tutor_editable ? 'Open and edit existing record' : 'View existing record'}
              </Link>
            ) : undefined
          }
        >
          {duplicate.own
            ? 'You already saved this session. Open the existing record instead of creating a duplicate.'
            : `It was recorded by ${duplicate.recorded_by ?? 'another tutor'}. If a separate session is genuinely needed, please contact Ms Aida.`}
        </Alert>
      )}
      <form className="card" onSubmit={continueToAttendance} noValidate>
        <div className="field">
          <label htmlFor="class">Class / Subject</label>
          <select id="class" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
            <option value="">— Select your class —</option>
            {ctx.classes.map((c) => (
              <option key={c.tutorial_group_id} value={c.tutorial_group_id}>
                {classLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="date">Class Date</label>
            <input id="date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
            <span className="hint">Defaults to today (Malaysia time). Future dates are not allowed.</span>
          </div>
          <div className="field">
            <label htmlFor="time">Class Time</label>
            <input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            <span className="hint">Start time of the tutorial.</span>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={loading || ctx.classes.length === 0}>
          {loading ? 'Loading roster…' : 'Continue to Attendance'}
        </button>
        {loading && <Spinner label="Loading roster…" />}
      </form>
    </div>
  );
}

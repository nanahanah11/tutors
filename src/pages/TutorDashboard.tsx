/** Tutor home (PRD §11.2). */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTutor } from '../hooks/useTutor';
import { tutorApi, ApiError } from '../services/tutorApi';
import type { TutorSession } from '../types/db';
import { errorMessage } from '../shared/errors';
import { formatDate, formatTime, formatTimestamp } from '../shared/time';
import { Alert, Spinner } from '../components/ui';
import { RosterNotice } from '../components/attendance/RosterNotice';

export default function TutorDashboard() {
  const { ctx } = useTutor();
  const [sessions, setSessions] = useState<TutorSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tutorApi
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError(errorMessage(e instanceof ApiError ? e.code : undefined)));
  }, []);

  if (!ctx) return null;
  const today = sessions?.filter((s) => s.class_date === ctx.today) ?? [];
  const earlier = sessions?.filter((s) => s.class_date !== ctx.today) ?? [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Welcome, {ctx.tutor.full_name}</h1>
          <p>Today (Malaysia time): {formatDate(ctx.today)}</p>
        </div>
        <Link to="/tutor/attendance/new" className="btn btn-primary btn-lg">
          + New Attendance
        </Link>
      </div>

      <RosterNotice />

      <section className="card" aria-labelledby="classes-h">
        <h2 id="classes-h">Your assigned classes</h2>
        {ctx.classes.length === 0 ? (
          <Alert kind="warn">You have no tutorial classes assigned. Please contact Ms Aida.</Alert>
        ) : (
          <ul className="class-list">
            {ctx.classes.map((c) => (
              <li key={c.tutorial_group_id}>
                <span>
                  <strong>
                    {c.module_short_name} – {c.tutorial_code}
                  </strong>
                  <br />
                  <span className="small muted">{c.module_name}</span>
                </span>
                <span className="small muted">{c.student_count} students</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="sessions-h">
        <h2 id="sessions-h">Your attendance records</h2>
        {error && <Alert kind="error">{error}</Alert>}
        {!sessions && !error && <Spinner />}
        {sessions && sessions.length === 0 && <p className="muted">You have not saved any attendance yet.</p>}
        {sessions && sessions.length > 0 && (
          <>
            <h3>Today</h3>
            <SessionTable sessions={today} empty="No attendance saved for today yet." />
            {earlier.length > 0 && (
              <>
                <h3 style={{ marginTop: '1rem' }}>Recent</h3>
                <SessionTable sessions={earlier} empty="" />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SessionTable({ sessions, empty }: { sessions: TutorSession[]; empty: string }) {
  if (sessions.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Time</th>
            <th scope="col">Class / Subject</th>
            <th scope="col" className="num">Present</th>
            <th scope="col" className="num">Absent</th>
            <th scope="col">Saved</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td className="nowrap">{formatDate(s.class_date)}</td>
              <td className="nowrap">{formatTime(s.class_time)}</td>
              <td>
                {s.module_short_name} – {s.tutorial_code}
              </td>
              <td className="num">{s.present_count}</td>
              <td className="num">{s.absent_count}</td>
              <td className="small">{formatTimestamp(s.last_tutor_edit_at ?? s.saved_at)}</td>
              <td>
                {s.tutor_editable ? (
                  <Link to={`/tutor/attendance/${s.id}`} className="btn btn-sm btn-primary">
                    Edit
                  </Link>
                ) : (
                  <span className="row" style={{ gap: '0.4rem' }}>
                    <span className="badge badge-neutral" title="The same-day edit window has closed">
                      <span aria-hidden="true">🔒</span> Read-only
                    </span>
                    <Link to={`/tutor/attendance/${s.id}`} className="btn btn-sm">
                      View
                    </Link>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

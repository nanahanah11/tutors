/** Lecturer attendance dashboard (PRD §9.9, §11.6, §19, §24.1). */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lecturerApi, type SessionFilters } from '../services/lecturerApi';
import type { Module, Profile, RecordDetail, SessionSummary, TutorialGroupOverview } from '../types/db';
import { formatDate, formatTime, formatTimestamp } from '../shared/time';
import { Alert, ApspaceBadge, Spinner, Stat, StatusBadge, downloadText } from '../components/ui';
import { attendanceCsv, exportFilename } from '../utils/exportCsv';

const FILTER_KEYS = ['moduleId', 'groupId', 'tutorId', 'from', 'to', 'apspace'] as const;

export default function LecturerDashboard() {
  const [params, setParams] = useSearchParams();
  const filters: SessionFilters = useMemo(
    () => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])) as SessionFilters,
    [params],
  );
  const [modules, setModules] = useState<Module[]>([]);
  const [groups, setGroups] = useState<TutorialGroupOverview[]>([]);
  const [tutors, setTutors] = useState<Profile[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  useEffect(() => {
    Promise.all([lecturerApi.modules(), lecturerApi.groups(), lecturerApi.tutorProfiles()])
      .then(([m, g, t]) => {
        setModules(m);
        setGroups(g);
        setTutors(t);
      })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    try {
      setSessions(await lecturerApi.sessions(filters));
      setLastLoaded(new Date());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filters]);

  useEffect(() => {
    setSessions(null);
    setSelected(new Set());
    void load();
    // Saved tutor attendance appears without manual refresh (FR-SAVE-004)
    const t = setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  function setFilter(key: (typeof FILTER_KEYS)[number], value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'moduleId') next.delete('groupId');
    setParams(next, { replace: true });
  }

  async function markKeyed(ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await lecturerApi.setApspace(ids, 'keyed_in');
      setNotice(`${r.updated} session${r.updated === 1 ? '' : 's'} marked as Keyed into APSpace.`);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function exportFiltered() {
    if (!sessions?.length) return;
    setBusy(true);
    try {
      const recs = await lecturerApi.sessionRecords(sessions.map((s) => s.id));
      downloadText(exportFilename('attendance-filtered'), attendanceCsv(recs));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const visibleGroups = groups.filter((g) => !filters.moduleId || g.module_id === filters.moduleId);
  const pending = sessions?.filter((s) => s.apspace_status === 'pending') ?? [];
  const allPendingSelected = pending.length > 0 && pending.every((s) => selected.has(s.id));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Attendance Dashboard</h1>
          <p>All saved tutorial sessions, newest first. {lastLoaded && <span className="small">Updated {lastLoaded.toLocaleTimeString()}</span>}</p>
        </div>
        <div className="row no-print">
          <button type="button" className="btn" onClick={() => void load()}>Refresh</button>
          <button type="button" className="btn" onClick={exportFiltered} disabled={busy || !sessions?.length}>
            Export CSV (filtered)
          </button>
        </div>
      </div>

      <section className="card no-print" aria-label="Filters">
        <div className="filters">
          <div className="field">
            <label htmlFor="f-module">Module</label>
            <select id="f-module" value={filters.moduleId} onChange={(e) => setFilter('moduleId', e.target.value)}>
              <option value="">All modules</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>{m.short_name} ({m.module_code})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-group">Group</label>
            <select id="f-group" value={filters.groupId} onChange={(e) => setFilter('groupId', e.target.value)}>
              <option value="">All groups</option>
              {visibleGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.tutorial_code}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-tutor">Tutor</label>
            <select id="f-tutor" value={filters.tutorId} onChange={(e) => setFilter('tutorId', e.target.value)}>
              <option value="">All tutors</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}{t.is_active ? '' : ' (inactive)'}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-from">From date</label>
            <input id="f-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter('from', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-to">To date</label>
            <input id="f-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-aps">APSpace status</label>
            <select id="f-aps" value={filters.apspace} onChange={(e) => setFilter('apspace', e.target.value)}>
              <option value="">All</option>
              <option value="pending">Pending APSpace Entry</option>
              <option value="keyed_in">Keyed into APSpace</option>
            </select>
          </div>
          <div className="field">
            <button type="button" className="btn" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Clear filters
            </button>
          </div>
        </div>
      </section>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}

      {sessions && (
        <div className="stats">
          <Stat label="Sessions shown" value={sessions.length} />
          <Stat label="Pending APSpace Entry" value={pending.length} tone="unmarked" />
          <Stat label="Keyed into APSpace" value={sessions.length - pending.length} tone="present" />
        </div>
      )}

      {selected.size > 0 && (
        <div className="alert no-print" role="region" aria-label="Bulk actions">
          <div className="row">
            <span>{selected.size} pending session{selected.size === 1 ? '' : 's'} selected.</span>
            <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => markKeyed([...selected])}>
              Mark selected as Keyed into APSpace
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        </div>
      )}

      {!sessions && !error && <Spinner label="Loading sessions…" />}
      {sessions && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" className="no-print">
                  <input
                    type="checkbox"
                    aria-label="Select all pending sessions"
                    checked={allPendingSelected}
                    disabled={pending.length === 0}
                    onChange={(e) => setSelected(e.target.checked ? new Set(pending.map((s) => s.id)) : new Set())}
                  />
                </th>
                <th scope="col">Date</th>
                <th scope="col">Module</th>
                <th scope="col">Tutorial Class</th>
                <th scope="col">Time</th>
                <th scope="col">Tutor</th>
                <th scope="col" className="num">Total</th>
                <th scope="col" className="num">Present</th>
                <th scope="col" className="num">Absent</th>
                <th scope="col">APSpace</th>
                <th scope="col" className="no-print">Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty">No attendance sessions match these filters.</td>
                </tr>
              )}
              {sessions.map((s) => (
                <tr key={s.id} className={s.apspace_status === 'pending' ? 'row-pending' : ''}>
                  <td className="no-print">
                    {s.apspace_status === 'pending' && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${s.tutorial_code} on ${formatDate(s.class_date)}`}
                        checked={selected.has(s.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          setSelected(next);
                        }}
                      />
                    )}
                  </td>
                  <td className="nowrap">{formatDate(s.class_date)}</td>
                  <td>{s.module_short_name}</td>
                  <td className="nowrap">{s.tutorial_code}</td>
                  <td className="nowrap">{formatTime(s.class_time)}</td>
                  <td>{s.tutor_name_snapshot}</td>
                  <td className="num">{s.total_students}</td>
                  <td className="num">{s.present_count}</td>
                  <td className="num">{s.absent_count}</td>
                  <td><ApspaceBadge status={s.apspace_status} /></td>
                  <td className="no-print">
                    <div className="row" style={{ gap: '0.4rem' }}>
                      <Link to={`/lecturer/attendance/${s.id}`} className="btn btn-sm btn-primary">View</Link>
                      {s.apspace_status === 'pending' && (
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => markKeyed([s.id])}>
                          Mark Keyed
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <StudentHistorySearch />
    </div>
  );
}

/** FR-DASH-010: search historical attendance by student ID or name. */
function StudentHistorySearch() {
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<RecordDetail[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setRows(await lecturerApi.searchStudentHistory(term));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const present = rows?.filter((r) => r.status === 'present').length ?? 0;

  return (
    <section className="card no-print" style={{ marginTop: '1.5rem' }} aria-labelledby="hist-h">
      <h2 id="hist-h">Student attendance history</h2>
      <form className="row" onSubmit={search}>
        <div className="field" style={{ flex: '1 1 260px', margin: 0 }}>
          <label htmlFor="hist-term">Student ID or name</label>
          <input id="hist-term" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="TP012345 or name" minLength={2} />
        </div>
        <button type="submit" className="btn" style={{ alignSelf: 'flex-end' }} disabled={busy || term.trim().length < 2}>
          Search
        </button>
      </form>
      {error && <Alert kind="error">{error}</Alert>}
      {rows && (
        <div style={{ marginTop: '1rem' }}>
          <p className="small muted">
            {rows.length} record{rows.length === 1 ? '' : 's'} found
            {rows.length > 0 && ` · Present ${present} · Absent ${rows.length - present}`}
          </p>
          {rows.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Class</th>
                    <th scope="col">Student</th>
                    <th scope="col">TP Number</th>
                    <th scope="col">Status</th>
                    <th scope="col">Remark</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Session</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{formatDate(r.class_date)} {formatTime(r.class_time)}</td>
                      <td className="nowrap">{r.tutorial_code}</td>
                      <td>{r.student_name}</td>
                      <td className="mono">{r.student_id}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.remark}</td>
                      <td className="small">{formatTimestamp(r.updated_at)}</td>
                      <td><Link to={`/lecturer/attendance/${r.attendance_session_id}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

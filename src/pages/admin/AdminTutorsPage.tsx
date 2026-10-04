/** Lecturer: tutor profiles, login passwords and tutor-group assignments (§7.1, §9.5, §11.8). */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { lecturerApi } from '../../services/lecturerApi';
import type { Assignment, Profile, TutorialGroupOverview } from '../../types/db';
import { TUTOR_USERNAME_PATTERN, usernameFromName } from '../../shared/tutorCode';
import { formatTimestamp } from '../../shared/time';
import { Alert, Modal, Spinner } from '../../components/ui';

export default function AdminTutorsPage() {
  const [tutors, setTutors] = useState<Profile[] | null>(null);
  const [codeSet, setCodeSet] = useState<Record<string, boolean>>({});
  const [groups, setGroups] = useState<TutorialGroupOverview[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newTutor, setNewTutor] = useState({ full_name: '', username: '' });
  const [issued, setIssued] = useState<{ name: string; username: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignForm, setAssignForm] = useState({ tutor_id: '', group_id: '', temporary: false, note: '' });

  const load = useCallback(async () => {
    try {
      const [t, g, a, status] = await Promise.all([
        lecturerApi.tutorProfiles(),
        lecturerApi.groups(),
        lecturerApi.assignments(),
        lecturerApi.tutorCodeStatus(),
      ]);
      setTutors(t);
      setGroups(g);
      setAssignments(a);
      setCodeSet(Object.fromEntries(status.map((s) => [s.id, s.code_set])));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run<T>(fn: () => Promise<T>, msg?: string): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      if (msg) setNotice(msg);
      await load();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function createTutor(e: FormEvent) {
    e.preventDefault();
    const username = newTutor.username || usernameFromName(newTutor.full_name);
    if (!TUTOR_USERNAME_PATTERN.test(username)) {
      setError('Username must be the tutor’s first name in 2–20 capital letters.');
      return;
    }
    const r = await run(() => lecturerApi.tutorCodeAction({ action: 'create', full_name: newTutor.full_name, username }));
    if (r) {
      setIssued({ name: r.tutor.full_name, username: r.tutor.tutor_code_prefix, password: r.password });
      setNewTutor({ full_name: '', username: '' });
    }
  }

  async function regenerate(t: Profile) {
    if (!window.confirm(`Generate a new password for ${t.full_name}? The old password stops working immediately and active sessions are signed out.`)) return;
    const r = await run(() => lecturerApi.tutorCodeAction({ action: 'regenerate', tutor_id: t.id, username: t.tutor_code_prefix ?? usernameFromName(t.full_name) }));
    if (r) setIssued({ name: r.tutor.full_name, username: r.tutor.tutor_code_prefix, password: r.password });
  }

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (!assignForm.tutor_id || !assignForm.group_id) return;
    const g = groups.find((x) => x.id === assignForm.group_id);
    await run(
      () => lecturerApi.assign(assignForm.tutor_id, assignForm.group_id, assignForm.temporary, assignForm.note),
      `Assigned to ${g?.tutorial_code}.`,
    );
    setAssignForm({ ...assignForm, group_id: '', note: '', temporary: false });
  }

  const groupById = new Map(groups.map((g) => [g.id, g]));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Tutors &amp; Passwords</h1>
          <p>A tutor signs in with their username (their first name in capitals) and an 8-character password. Only a secure hash is stored – a password is shown once when generated.</p>
        </div>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}

      {!tutors ? <Spinner /> : (
        <section className="card">
          <h2>Tutor profiles</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tutor</th><th>Username</th><th>Password</th><th>Assigned classes</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {tutors.map((t) => {
                  const mine = assignments.filter((a) => a.tutor_profile_id === t.id);
                  return (
                    <tr key={t.id}>
                      <td><strong>{t.full_name}</strong><div className="small muted mono">{t.id}</div></td>
                      <td className="mono">{t.tutor_code_prefix}</td>
                      <td>
                        {codeSet[t.id] === false ? (
                          <span className="badge badge-pending">Not generated</span>
                        ) : (
                          <span className="small">Set {formatTimestamp(t.tutor_code_updated_at)}</span>
                        )}
                      </td>
                      <td>
                        {mine.length === 0 && <span className="muted">None</span>}
                        {mine.map((a) => (
                          <div key={a.id} className="row" style={{ gap: '0.35rem', marginBottom: '0.25rem' }}>
                            <span className="mono">{groupById.get(a.tutorial_group_id)?.tutorial_code ?? '?'}</span>
                            {a.is_temporary_cover && <span className="badge badge-pending">cover</span>}
                            <button
                              type="button"
                              className="btn btn-sm"
                              aria-label={`Remove ${t.full_name} from ${groupById.get(a.tutorial_group_id)?.tutorial_code}`}
                              disabled={busy}
                              onClick={() => run(() => lecturerApi.unassign(a.id), 'Assignment removed.')}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </td>
                      <td>{t.is_active ? <span className="badge badge-keyed">Active</span> : <span className="badge badge-neutral">Inactive</span>}</td>
                      <td>
                        <div className="row" style={{ gap: '0.4rem' }}>
                          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !t.is_active} onClick={() => regenerate(t)}>
                            {codeSet[t.id] === false ? 'Generate password' : 'Reset password'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() => run(() => lecturerApi.setTutorActive(t.id, !t.is_active), t.is_active ? 'Tutor deactivated – their login no longer works.' : 'Tutor reactivated.')}
                          >
                            {t.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid-2">
        <form className="card" onSubmit={assign}>
          <h2>Assign tutor to a tutorial class</h2>
          <p className="small muted">A tutor covering another group must be assigned here before they can record attendance (BR-016).</p>
          <div className="field"><label htmlFor="a-tutor">Tutor</label>
            <select id="a-tutor" value={assignForm.tutor_id} onChange={(e) => setAssignForm({ ...assignForm, tutor_id: e.target.value })} required>
              <option value="">Select…</option>
              {tutors?.filter((t) => t.is_active).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="a-group">Tutorial class</label>
            <select id="a-group" value={assignForm.group_id} onChange={(e) => setAssignForm({ ...assignForm, group_id: e.target.value })} required>
              <option value="">Select…</option>
              {groups.filter((g) => g.is_active).map((g) => (
                <option key={g.id} value={g.id} disabled={assignments.some((a) => a.tutor_profile_id === assignForm.tutor_id && a.tutorial_group_id === g.id)}>
                  {g.module_short_name} – {g.tutorial_code}{g.assigned_tutors ? ` (${g.assigned_tutors})` : ' (unassigned)'}
                </option>
              ))}
            </select></div>
          <label className="check" style={{ marginBottom: '0.75rem' }}>
            <input type="checkbox" checked={assignForm.temporary} onChange={(e) => setAssignForm({ ...assignForm, temporary: e.target.checked })} />
            Temporary cover
          </label>
          <div className="field"><label htmlFor="a-note">Note</label>
            <input id="a-note" value={assignForm.note} onChange={(e) => setAssignForm({ ...assignForm, note: e.target.value })} placeholder="optional, e.g. covering 10/10 only" /></div>
          <button type="submit" className="btn btn-primary" disabled={busy}>Assign</button>
        </form>

        <form className="card" onSubmit={createTutor}>
          <h2>Add tutor</h2>
          <div className="field"><label htmlFor="t-name">Tutor name</label>
            <input id="t-name" value={newTutor.full_name} onChange={(e) => setNewTutor({ ...newTutor, full_name: e.target.value })} required maxLength={100} /></div>
          <div className="field"><label htmlFor="t-prefix">Username</label>
            <input id="t-prefix" value={newTutor.username} placeholder={usernameFromName(newTutor.full_name)} onChange={(e) => setNewTutor({ ...newTutor, username: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
            <span className="hint">Defaults to the first name in capitals.</span></div>
          <button type="submit" className="btn btn-primary" disabled={busy}>Create tutor &amp; generate password</button>
        </form>
      </div>

      <Modal
        open={!!issued}
        title="New tutor password"
        onClose={() => setIssued(null)}
        footer={<button type="button" className="btn btn-primary" onClick={() => setIssued(null)}>I have recorded the password</button>}
      >
        {issued && (
          <>
            <p>Share these login details privately with <strong>{issued.name}</strong> only. The password will not be shown again.</p>
            <dl className="kv">
              <dt>Username</dt><dd className="mono">{issued.username}</dd>
              <dt>Password</dt><dd className="mono" style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.12em' }}>{issued.password}</dd>
            </dl>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(`Username: ${issued.username}\nPassword: ${issued.password}`)}>Copy login details</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

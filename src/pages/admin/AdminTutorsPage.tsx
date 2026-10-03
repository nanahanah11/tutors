/** Lecturer: tutor profiles, access codes and tutor-group assignments (§7.1, §9.5, §11.8). */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { lecturerApi } from '../../services/lecturerApi';
import type { Assignment, Profile, TutorialGroupOverview } from '../../types/db';
import { prefixFromName, TUTOR_PREFIX_PATTERN } from '../../shared/tutorCode';
import { formatTimestamp } from '../../shared/time';
import { Alert, Modal, Spinner } from '../../components/ui';

export default function AdminTutorsPage() {
  const [tutors, setTutors] = useState<Profile[] | null>(null);
  const [codeSet, setCodeSet] = useState<Record<string, boolean>>({});
  const [groups, setGroups] = useState<TutorialGroupOverview[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newTutor, setNewTutor] = useState({ full_name: '', prefix: '' });
  const [issued, setIssued] = useState<{ name: string; code: string } | null>(null);
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
    const prefix = newTutor.prefix || prefixFromName(newTutor.full_name);
    if (!TUTOR_PREFIX_PATTERN.test(prefix)) {
      setError('Code prefix must be the tutor’s first name in 2–20 uppercase letters.');
      return;
    }
    const r = await run(() => lecturerApi.tutorCodeAction({ action: 'create', full_name: newTutor.full_name, prefix }));
    if (r) {
      setIssued({ name: r.tutor.full_name, code: r.code });
      setNewTutor({ full_name: '', prefix: '' });
    }
  }

  async function regenerate(t: Profile) {
    if (!window.confirm(`Generate a new code for ${t.full_name}? The old code stops working immediately and active sessions are signed out.`)) return;
    const r = await run(() => lecturerApi.tutorCodeAction({ action: 'regenerate', tutor_id: t.id, prefix: t.tutor_code_prefix ?? prefixFromName(t.full_name) }));
    if (r) setIssued({ name: r.tutor.full_name, code: r.code });
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
          <h1>Tutors &amp; Access Codes</h1>
          <p>Codes are tutor first name + 3 random digits (e.g. MAY123). Only a secure hash is stored – a code is shown once when generated.</p>
        </div>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}

      {!tutors ? <Spinner /> : (
        <section className="card">
          <h2>Tutor profiles</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tutor</th><th>Code format</th><th>Code</th><th>Assigned classes</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {tutors.map((t) => {
                  const mine = assignments.filter((a) => a.tutor_profile_id === t.id);
                  return (
                    <tr key={t.id}>
                      <td><strong>{t.full_name}</strong><div className="small muted mono">{t.id}</div></td>
                      <td className="mono">{t.tutor_code_prefix}###</td>
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
                            {codeSet[t.id] === false ? 'Generate code' : 'Regenerate code'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() => run(() => lecturerApi.setTutorActive(t.id, !t.is_active), t.is_active ? 'Tutor deactivated – their code no longer works.' : 'Tutor reactivated.')}
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
          <div className="field"><label htmlFor="t-prefix">Code prefix</label>
            <input id="t-prefix" value={newTutor.prefix} placeholder={prefixFromName(newTutor.full_name) || 'MAY'} onChange={(e) => setNewTutor({ ...newTutor, prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
            <span className="hint">Defaults to the first name in capitals.</span></div>
          <button type="submit" className="btn btn-primary" disabled={busy}>Create tutor &amp; generate code</button>
        </form>
      </div>

      <Modal
        open={!!issued}
        title="New tutor access code"
        onClose={() => setIssued(null)}
        footer={<button type="button" className="btn btn-primary" onClick={() => setIssued(null)}>I have recorded the code</button>}
      >
        {issued && (
          <>
            <p>Share this code privately with <strong>{issued.name}</strong> only. It will not be shown again.</p>
            <p style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '0.15em', textAlign: 'center' }} className="mono">{issued.code}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(issued.code)}>Copy code</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

/** Lecturer: tutorial groups (FR-GRP-001..006) and their rosters. */
import { useEffect, useState, type FormEvent } from 'react';
import { lecturerApi } from '../../services/lecturerApi';
import type { Enrolment, Module, Student, TutorialGroupOverview } from '../../types/db';
import { Alert, Spinner } from '../../components/ui';

export default function AdminGroupsPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [groups, setGroups] = useState<TutorialGroupOverview[] | null>(null);
  const [form, setForm] = useState({ module_id: '', group_number: '', tutorial_code: '', display_name: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<TutorialGroupOverview | null>(null);
  const [roster, setRoster] = useState<Array<{ enrolment: Enrolment; student: Student }> | null>(null);

  const load = async () => {
    try {
      const [m, g] = await Promise.all([lecturerApi.modules(), lecturerApi.groups()]);
      setModules(m);
      setGroups(g);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const suggestCode = (moduleId: string, num: string) => {
    const m = modules.find((x) => x.id === moduleId);
    return m && num ? `${m.module_code}-T-${num}` : '';
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await lecturerApi.saveGroup({ ...form, tutorial_code: form.tutorial_code || suggestCode(form.module_id, form.group_number) });
      setNotice('Tutorial group created.');
      setForm({ module_id: form.module_id, group_number: '', tutorial_code: '', display_name: '' });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function openRoster(g: TutorialGroupOverview) {
    setOpen(g);
    setRoster(null);
    try {
      setRoster(await lecturerApi.groupRoster(g.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleEnrolment(e: Enrolment) {
    try {
      await lecturerApi.setEnrolmentActive(e.id, !e.is_active);
      if (open) await openRoster(open);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <div className="page-head"><div><h1>Tutorial Groups</h1><p>The full tutorial class code is shown to tutors and in reports.</p></div></div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}

      <form className="card" onSubmit={save}>
        <h2>Add tutorial group</h2>
        <div className="filters">
          <div className="field"><label htmlFor="g-mod">Module</label>
            <select id="g-mod" value={form.module_id} onChange={(e) => setForm({ ...form, module_id: e.target.value })} required>
              <option value="">Select…</option>
              {modules.filter((m) => m.is_active).map((m) => <option key={m.id} value={m.id}>{m.short_name} ({m.module_code})</option>)}
            </select></div>
          <div className="field"><label htmlFor="g-num">Group number</label>
            <input id="g-num" inputMode="numeric" pattern="[0-9]+" value={form.group_number} onChange={(e) => setForm({ ...form, group_number: e.target.value.replace(/\D/g, '') })} required /></div>
          <div className="field"><label htmlFor="g-code">Tutorial class code</label>
            <input id="g-code" value={form.tutorial_code} placeholder={suggestCode(form.module_id, form.group_number) || 'CT046-3-2-SDM-T-40'} onChange={(e) => setForm({ ...form, tutorial_code: e.target.value.toUpperCase() })} />
            <span className="hint">Leave blank to use the suggested code.</span></div>
          <div className="field"><button type="submit" className="btn btn-primary">Add group</button></div>
        </div>
      </form>

      {!groups ? <Spinner /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Module</th><th>Tutorial class</th><th className="num">Group</th><th className="num">Active students</th><th>Assigned tutors</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.module_short_name}</td>
                  <td className="mono">{g.tutorial_code}</td>
                  <td className="num">{g.group_number}</td>
                  <td className="num">{g.active_students}</td>
                  <td>{g.assigned_tutors || <span className="badge badge-neutral">Unassigned – lecturer-controlled</span>}</td>
                  <td>{g.is_active ? <span className="badge badge-keyed">Active</span> : <span className="badge badge-neutral">Archived</span>}</td>
                  <td className="row" style={{ gap: '0.4rem' }}>
                    <button type="button" className="btn btn-sm" onClick={() => openRoster(g)}>Roster</button>
                    <button type="button" className="btn btn-sm" onClick={async () => { try { await lecturerApi.setGroupActive(g.id, !g.is_active); await load(); } catch (e) { setError((e as Error).message); } }}>
                      {g.is_active ? 'Archive' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <section className="card" style={{ marginTop: '1.5rem' }} aria-labelledby="roster-h">
          <div className="card-header">
            <h2 id="roster-h">Roster – {open.tutorial_code}</h2>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(null)}>Close</button>
          </div>
          <p className="small muted">Use the Students page to enrol or move students between groups.</p>
          {!roster ? <Spinner /> : roster.length === 0 ? <p className="muted">No students enrolled.</p> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Student Name</th><th>TP Number</th><th>Enrolment</th><th>Action</th></tr></thead>
                <tbody>
                  {roster.map(({ enrolment, student }, i) => (
                    <tr key={enrolment.id}>
                      <td className="num">{i + 1}</td>
                      <td>{student.full_name}{!student.is_active && <span className="badge badge-neutral"> student inactive</span>}</td>
                      <td className="mono">{student.student_id}</td>
                      <td>{enrolment.is_active ? <span className="badge badge-keyed">Active</span> : <span className="badge badge-neutral">Inactive</span>}</td>
                      <td><button type="button" className="btn btn-sm" onClick={() => toggleEnrolment(enrolment)}>{enrolment.is_active ? 'Deactivate' : 'Reactivate'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

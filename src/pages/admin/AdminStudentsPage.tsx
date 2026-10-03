/** Lecturer: student master data and module-specific group enrolment (FR-STU-001..004, FR-STU-012). */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { lecturerApi } from '../../services/lecturerApi';
import type { Enrolment, Student, TutorialGroupOverview } from '../../types/db';
import { Alert, Spinner } from '../../components/ui';

export default function AdminStudentsPage() {
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [groups, setGroups] = useState<TutorialGroupOverview[]>([]);
  const [form, setForm] = useState({ student_id: '', full_name: '', group_id: '' });
  const [selected, setSelected] = useState<Student | null>(null);
  const [enrolments, setEnrolments] = useState<Enrolment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStudents(await lecturerApi.students(search, includeInactive));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [search, includeInactive]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    lecturerApi.groups().then(setGroups).catch((e) => setError(e.message));
  }, []);

  async function select(s: Student) {
    setSelected(s);
    setEnrolments(await lecturerApi.studentEnrolments(s.id));
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const s = await lecturerApi.saveStudent({ student_id: form.student_id, full_name: form.full_name });
      const g = groups.find((x) => x.id === form.group_id);
      if (g) await lecturerApi.enrol(s.id, g, groups);
      setNotice(`Student ${s.full_name} (${s.student_id}) added${g ? ` to ${g.tutorial_code}` : ''}.`);
      setForm({ student_id: '', full_name: '', group_id: form.group_id });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function wrap(fn: () => Promise<unknown>, msg: string) {
    setError(null);
    try {
      await fn();
      setNotice(msg);
      await load();
      if (selected) await select({ ...selected });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const modulesSeen = [...new Map(groups.map((g) => [g.module_id, g.module_short_name])).entries()];

  return (
    <div>
      <div className="page-head"><div><h1>Students</h1><p>Only Ms Aida can change the student list. Deactivate instead of deleting.</p></div></div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}

      <form className="card" onSubmit={add}>
        <h2>Add student</h2>
        <div className="filters">
          <div className="field"><label htmlFor="s-tp">TP number</label>
            <input id="s-tp" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value.toUpperCase() })} placeholder="TP012345" required /></div>
          <div className="field"><label htmlFor="s-name">Full name</label>
            <input id="s-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
          <div className="field"><label htmlFor="s-grp">Tutorial group</label>
            <select id="s-grp" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
              <option value="">— none —</option>
              {groups.filter((g) => g.is_active).map((g) => <option key={g.id} value={g.id}>{g.tutorial_code}</option>)}
            </select></div>
          <div className="field"><button type="submit" className="btn btn-primary">Add student</button></div>
        </div>
      </form>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="row" style={{ marginBottom: '0.75rem' }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor="s-search">Search name or TP number</label>
              <input id="s-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <label className="check" style={{ alignSelf: 'flex-end' }}>
              <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} /> Include inactive
            </label>
          </div>
          {!students ? <Spinner /> : (
            <div className="table-wrap" style={{ maxHeight: '60vh' }}>
              <table>
                <thead><tr><th>Student Name</th><th>TP Number</th><th>Status</th></tr></thead>
                <tbody>
                  {students.length === 0 && <tr><td colSpan={3} className="empty">No students found.</td></tr>}
                  {students.map((s) => (
                    <tr key={s.id} style={selected?.id === s.id ? { background: 'var(--surface-2)' } : undefined}>
                      <td><button type="button" className="btn-link" onClick={() => select(s)}>{s.full_name}</button></td>
                      <td className="mono">{s.student_id}</td>
                      <td>{s.is_active ? 'Active' : 'Inactive'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted">Showing up to 500 results.</p>
        </section>

        {selected && (
          <StudentEditor
            key={selected.id}
            student={selected}
            enrolments={enrolments}
            groups={groups}
            modules={modulesSeen}
            groupById={groupById}
            onSave={(s) => wrap(() => lecturerApi.saveStudent(s), 'Student updated.')}
            onEnrol={(g) => wrap(() => lecturerApi.enrol(selected.id, g, groups), `Enrolled into ${g.tutorial_code}.`)}
            onToggleEnrolment={(e) => wrap(() => lecturerApi.setEnrolmentActive(e.id, !e.is_active), 'Enrolment updated.')}
          />
        )}
      </div>
    </div>
  );
}

function StudentEditor({
  student,
  enrolments,
  groups,
  modules,
  groupById,
  onSave,
  onEnrol,
  onToggleEnrolment,
}: {
  student: Student;
  enrolments: Enrolment[];
  groups: TutorialGroupOverview[];
  modules: Array<[string, string]>;
  groupById: Map<string, TutorialGroupOverview>;
  onSave: (s: Student) => void;
  onEnrol: (g: TutorialGroupOverview) => void;
  onToggleEnrolment: (e: Enrolment) => void;
}) {
  const [name, setName] = useState(student.full_name);
  const [tp, setTp] = useState(student.student_id);
  return (
    <section className="card" aria-labelledby="edit-h">
      <h2 id="edit-h">{student.full_name}</h2>
      <div className="field"><label htmlFor="e-name">Full name</label><input id="e-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label htmlFor="e-tp">TP number</label><input id="e-tp" value={tp} onChange={(e) => setTp(e.target.value.toUpperCase())} /></div>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => onSave({ ...student, full_name: name, student_id: tp })}>Save</button>
        <button type="button" className="btn" onClick={() => onSave({ ...student, is_active: !student.is_active })}>
          {student.is_active ? 'Mark inactive' : 'Reactivate'}
        </button>
      </div>
      <h3 style={{ marginTop: '1.25rem' }}>Tutorial groups by module</h3>
      {modules.map(([moduleId, shortName]) => {
        const active = enrolments.find((e) => e.is_active && groupById.get(e.tutorial_group_id)?.module_id === moduleId);
        return (
          <div className="field" key={moduleId}>
            <label htmlFor={`enrol-${moduleId}`}>{shortName}</label>
            <select
              id={`enrol-${moduleId}`}
              value={active?.tutorial_group_id ?? ''}
              onChange={(e) => {
                const g = groupById.get(e.target.value);
                if (g) onEnrol(g);
                else if (active) onToggleEnrolment(active);
              }}
            >
              <option value="">— not enrolled —</option>
              {groups.filter((g) => g.module_id === moduleId && g.is_active).map((g) => <option key={g.id} value={g.id}>{g.tutorial_code}</option>)}
            </select>
          </div>
        );
      })}
      {enrolments.some((e) => !e.is_active) && (
        <p className="small muted">
          Previous enrolments: {enrolments.filter((e) => !e.is_active).map((e) => groupById.get(e.tutorial_group_id)?.tutorial_code).join(', ')}
        </p>
      )}
    </section>
  );
}

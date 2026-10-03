/** Lecturer: modules (FR-MOD-001..003). */
import { useEffect, useState, type FormEvent } from 'react';
import { lecturerApi } from '../../services/lecturerApi';
import type { Module } from '../../types/db';
import { Alert, Spinner } from '../../components/ui';

const EMPTY = { module_code: '', short_name: '', module_name: '', intake_semester: '' };

export default function AdminModulesPage() {
  const [modules, setModules] = useState<Module[] | null>(null);
  const [form, setForm] = useState<typeof EMPTY & { id?: string }>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => lecturerApi.modules().then(setModules).catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await lecturerApi.saveModule(form);
      setNotice(form.id ? 'Module updated.' : 'Module created.');
      setForm(EMPTY);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggle(m: Module) {
    try {
      await lecturerApi.saveModule({ ...m, is_active: !m.is_active });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <div className="page-head"><div><h1>Modules</h1><p>Archive instead of deleting – historical attendance is kept.</p></div></div>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}
      <form className="card" onSubmit={save}>
        <h2>{form.id ? 'Edit module' : 'Add module'}</h2>
        <div className="filters">
          <div className="field"><label htmlFor="m-code">Module code</label>
            <input id="m-code" value={form.module_code} onChange={(e) => setForm({ ...form, module_code: e.target.value.toUpperCase() })} placeholder="CT046-3-2-SDM" required /></div>
          <div className="field"><label htmlFor="m-short">Short name</label>
            <input id="m-short" value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} placeholder="SDM" required /></div>
          <div className="field"><label htmlFor="m-name">Module name</label>
            <input id="m-name" value={form.module_name} onChange={(e) => setForm({ ...form, module_name: e.target.value })} required /></div>
          <div className="field"><label htmlFor="m-intake">Intake / semester</label>
            <input id="m-intake" value={form.intake_semester} onChange={(e) => setForm({ ...form, intake_semester: e.target.value })} placeholder="optional" /></div>
          <div className="field row">
            <button type="submit" className="btn btn-primary">{form.id ? 'Save' : 'Add module'}</button>
            {form.id && <button type="button" className="btn" onClick={() => setForm(EMPTY)}>Cancel</button>}
          </div>
        </div>
      </form>
      {!modules ? <Spinner /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Short</th><th>Name</th><th>Intake</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.module_code}</td>
                  <td>{m.short_name}</td>
                  <td>{m.module_name}</td>
                  <td>{m.intake_semester ?? '—'}</td>
                  <td>{m.is_active ? <span className="badge badge-keyed">Active</span> : <span className="badge badge-neutral">Archived</span>}</td>
                  <td className="row" style={{ gap: '0.4rem' }}>
                    <button type="button" className="btn btn-sm" onClick={() => setForm({ id: m.id, module_code: m.module_code, short_name: m.short_name, module_name: m.module_name, intake_semester: m.intake_semester ?? '' })}>Edit</button>
                    <button type="button" className="btn btn-sm" onClick={() => toggle(m)}>{m.is_active ? 'Archive' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Lecturer login – Supabase Auth email/password (FR-AUTH-002, §11.1). */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLecturer } from '../hooks/useLecturer';
import { supabaseConfigured } from '../lib/supabase';
import { Alert } from '../components/ui';

export default function LecturerLogin() {
  const { profile, signIn } = useLecturer();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;

  useEffect(() => {
    if (profile) navigate(from && from.startsWith('/lecturer') ? from : '/lecturer', { replace: true });
  }, [profile, from, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <div className="landing-card">
        <div className="landing-brand">
          <div className="logo" aria-hidden="true">APU</div>
          <h1>Lecturer Login</h1>
          <p className="muted">APU Tutorial Attendance System</p>
        </div>
        <form className="card" onSubmit={submit}>
          {!supabaseConfigured && <Alert kind="warn">Supabase is not configured for this deployment.</Alert>}
          {error && <Alert kind="error">{error}</Alert>}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="small" style={{ marginTop: '1rem', textAlign: 'center' }}>
            <Link to="/">Tutor? Enter your tutor code instead</Link>
          </p>
        </form>
      </div>
    </main>
  );
}

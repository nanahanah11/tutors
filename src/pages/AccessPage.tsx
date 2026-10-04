/** Landing page (PRD §11.1): tutor code entry + lecturer login link. No student data here. */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { tutorApi, ApiError } from '../services/tutorApi';
import { useTutor } from '../hooks/useTutor';
import { errorMessage } from '../shared/errors';
import { normalizeUsername } from '../shared/tutorCode';
import { Alert } from '../components/ui';

export default function AccessPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { ctx, refresh } = useTutor();
  const navigate = useNavigate();
  const location = useLocation();
  const expired = (location.state as { expired?: boolean } | null)?.expired;

  useEffect(() => {
    if (ctx) navigate('/tutor', { replace: true });
  }, [ctx, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const user = normalizeUsername(username);
    if (!user || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await tutorApi.login(user, password);
      await refresh();
      navigate('/tutor', { replace: true });
    } catch (err) {
      const errCode = err instanceof ApiError ? err.code : 'SERVER_ERROR';
      const missing = err instanceof ApiError && Array.isArray(err.data.missing) ? (err.data.missing as string[]) : [];
      setError(errorMessage(errCode) + (missing.length ? ` (Missing server settings: ${missing.join(', ')})` : ''));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="landing">
      <div className="landing-card">
        <div className="landing-brand">
          <div className="logo" aria-hidden="true">APU</div>
          <h1>APU Tutorial Attendance System</h1>
          <p className="muted">SDM &amp; ISWE tutorial attendance</p>
        </div>

        <div className="card">
          <h2>Tutor login</h2>
          {expired && !error && <Alert kind="warn">{errorMessage('UNAUTHENTICATED')}</Alert>}
          {error && <Alert kind="error">{error}</Alert>}
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="tutor-username">Username</label>
              <input
                id="tutor-username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toUpperCase())}
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={24}
                required
              />
              <span className="hint">Your tutor ID.</span>
            </div>
            <div className="field">
              <label htmlFor="tutor-password">Password</label>
              <input
                id="tutor-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                maxLength={64}
                required
              />
              <span className="hint">The 8-character password given to you. Do not share it.</span>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="divider">or</div>
          <Link to="/lecturer/login" className="btn" style={{ width: '100%' }}>
            Lecturer Login
          </Link>
        </div>
        <p className="small muted" style={{ textAlign: 'center' }}>
          Authorised APU staff only. Student information is personal data – handle it accordingly.
        </p>
      </div>
    </main>
  );
}

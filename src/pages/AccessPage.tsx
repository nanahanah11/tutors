/** Landing page (PRD §11.1): tutor code entry + lecturer login link. No student data here. */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { tutorApi, ApiError } from '../services/tutorApi';
import { useTutor } from '../hooks/useTutor';
import { errorMessage } from '../shared/errors';
import { normalizeTutorCode, isValidTutorCodeFormat } from '../shared/tutorCode';
import { Alert } from '../components/ui';

export default function AccessPage() {
  const [code, setCode] = useState('');
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
    const normalized = normalizeTutorCode(code);
    if (!isValidTutorCodeFormat(normalized)) {
      setError('Enter your tutor code: your first name followed by 3 digits.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await tutorApi.login(normalized);
      await refresh();
      navigate('/tutor', { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'SERVER_ERROR';
      const missing = err instanceof ApiError && Array.isArray(err.data.missing) ? (err.data.missing as string[]) : [];
      setError(errorMessage(code) + (missing.length ? ` (Missing server settings: ${missing.join(', ')})` : ''));
      setCode('');
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
          <h2>Tutor entry</h2>
          {expired && !error && <Alert kind="warn">{errorMessage('UNAUTHENTICATED')}</Alert>}
          {error && <Alert kind="error">{error}</Alert>}
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="tutor-code">Tutor Code</label>
              <input
                id="tutor-code"
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={24}
                required
                aria-describedby="tutor-code-hint"
              />
              <span id="tutor-code-hint" className="hint">
                Your first name followed by your 3 private digits. Do not share your code.
              </span>
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
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

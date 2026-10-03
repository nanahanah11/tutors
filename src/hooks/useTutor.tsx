/** Tutor session context: identity + assigned classes from GET /api/tutor/me. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { tutorApi } from '../services/tutorApi';
import type { TutorContext } from '../types/db';
import { Spinner } from '../components/ui';

interface TutorState {
  ctx: TutorContext | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<TutorState | null>(null);

export function TutorProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<TutorContext | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setCtx(await tutorApi.me());
    } catch {
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onExpired = () => setCtx(null);
    window.addEventListener('tutor-session-expired', onExpired);
    return () => window.removeEventListener('tutor-session-expired', onExpired);
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await tutorApi.logout();
    } finally {
      setCtx(null);
    }
  }, []);

  return <Ctx.Provider value={{ ctx, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useTutor(): TutorState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTutor must be used inside TutorProvider');
  return v;
}

/** Route guard: no tutor screen renders until the code has been validated (FR-AUTH-001). */
export function RequireTutor({ children }: { children: ReactNode }) {
  const { ctx, loading } = useTutor();
  const loc = useLocation();
  if (loading) return <Spinner label="Checking tutor session…" />;
  if (!ctx) return <Navigate to="/" replace state={{ expired: loc.pathname !== '/', from: loc.pathname }} />;
  return <>{children}</>;
}

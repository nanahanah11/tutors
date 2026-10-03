/** Lecturer (Ms Aida) Supabase Auth session + application profile check. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { lecturerApi } from '../services/lecturerApi';
import type { Profile } from '../types/db';
import { Spinner } from '../components/ui';

interface LecturerState {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<LecturerState | null>(null);

export function LecturerProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setProfile(await lecturerApi.currentLecturer());
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setProfile(null);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error('Invalid email or password.');
    const p = await lecturerApi.currentLecturer();
    if (!p) {
      await supabase.auth.signOut();
      throw new Error('This account is not authorised as the lecturer for this system.');
    }
    setProfile(p);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return <Ctx.Provider value={{ profile, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useLecturer(): LecturerState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLecturer must be used inside LecturerProvider');
  return v;
}

export function RequireLecturer({ children }: { children: ReactNode }) {
  const { profile, loading } = useLecturer();
  const loc = useLocation();
  if (loading) return <Spinner label="Checking lecturer session…" />;
  if (!profile) return <Navigate to="/lecturer/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

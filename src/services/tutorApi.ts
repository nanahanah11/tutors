/** Browser client for the tutor Netlify Functions. The session lives in an HttpOnly cookie. */
import type { AttendanceStatus } from '../shared/roster';
import type { RosterStudent } from '../shared/roster';
import type { TutorContext, TutorSession, TutorSessionStudent } from '../types/db';

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

type Json = Record<string, unknown>;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 0);
  }
  let data: Json = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || data.ok === false) {
    if (res.status === 401 && path !== '/api/tutor-auth/login') {
      window.dispatchEvent(new CustomEvent('tutor-session-expired'));
    }
    throw new ApiError(String(data.error ?? (res.status >= 500 ? 'SERVER_ERROR' : 'INVALID_PAYLOAD')), res.status, data);
  }
  return data as T;
}

export interface SaveRecord {
  student_id: string;
  status: AttendanceStatus;
  remark?: string;
}

export const tutorApi = {
  login: (username: string, password: string) =>
    call<{ ok: true; tutor: { id: string; full_name: string } }>('/api/tutor-auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => call<{ ok: true }>('/api/tutor-auth/logout', { method: 'POST', body: '{}' }),
  me: () => call<TutorContext>('/api/tutor/me'),
  roster: (groupId: string) =>
    call<{ ok: true; students: RosterStudent[] }>(`/api/tutor/classes/${encodeURIComponent(groupId)}/roster`),
  sessions: () => call<{ ok: true; today: string; sessions: TutorSession[] }>('/api/tutor/sessions'),
  session: (id: string) =>
    call<{ ok: true; today: string; session: TutorSession; students: TutorSessionStudent[] }>(
      `/api/tutor/sessions/${encodeURIComponent(id)}`,
    ),
  lookup: (groupId: string, date: string, time: string) =>
    call<{ ok: true; exists: boolean; session_id?: string; recorded_by?: string; own?: boolean; tutor_editable?: boolean }>(
      `/api/tutor/sessions/lookup?${new URLSearchParams({ groupId, date, time })}`,
    ),
  create: (body: { tutorial_group_id: string; class_date: string; class_time: string; records: SaveRecord[] }) =>
    call<{ ok: true; created: true; session: TutorSession }>('/api/tutor/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (id: string, records: SaveRecord[]) =>
    call<{ ok: true; changed: number; session: TutorSession }>(`/api/tutor/sessions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ records }),
    }),
};

/** Data-access boundary for the tutor/admin functions (implemented with the Supabase service role). */
export interface TutorRecord {
  id: string;
  full_name: string;
  tutor_code_prefix: string;
  tutor_code_hash: string;
  is_active: boolean;
}

export interface LecturerRecord {
  id: string;
  full_name: string;
}

export interface Backend {
  /** Active tutor profiles with this code prefix (0 or 1 because of a partial unique index). */
  findActiveTutorsByPrefix(prefix: string): Promise<TutorRecord[]>;
  getTutor(id: string): Promise<TutorRecord | null>;
  countRecentFailures(clientHash: string, prefix: string | null, sinceIso: string): Promise<{ client: number; prefix: number }>;
  recordAttempt(attempt: { clientHash: string; prefix: string | null; success: boolean }): Promise<void>;
  /** Calls a trusted database function and returns its JSON result. */
  rpc<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T>;
  /** Resolves a Supabase Auth access token to an active lecturer profile. */
  lecturerFromAccessToken(accessToken: string): Promise<LecturerRecord | null>;
  listTutors(): Promise<Array<Omit<TutorRecord, 'tutor_code_hash'> & { code_set: boolean; tutor_code_updated_at: string | null }>>;
}

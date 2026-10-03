/** Lecturer data access via Supabase (RLS-protected) and lecturer-only RPCs. */
import { supabase } from '../lib/supabase';
import type {
  Assignment,
  AuditLog,
  Enrolment,
  Module,
  Profile,
  RecordDetail,
  SessionSummary,
  Student,
  TutorialGroupOverview,
} from '../types/db';
import type { ApspaceStatus } from '../shared/apspace';
import type { AttendanceStatus } from '../shared/roster';
import type { NormalizedRosterRow } from '../shared/rosterImport';

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(friendlyDbError(res.error));
  return res.data as T;
}

function friendlyDbError(err: { message: string; code?: string }): string {
  if (err.code === '23505') return 'That value already exists (duplicate). Please use a unique value.';
  if (err.code === '42501') return 'You do not have permission to perform this action.';
  if (err.code === '23514') return `Invalid data: ${err.message}`;
  return err.message || 'Database error';
}

export interface SessionFilters {
  moduleId?: string;
  groupId?: string;
  tutorId?: string;
  from?: string;
  to?: string;
  apspace?: '' | ApspaceStatus;
}

export const lecturerApi = {
  async currentLecturer(): Promise<Profile | null> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const res = await supabase
      .from('profiles')
      .select('id, auth_user_id, full_name, role, tutor_code_prefix, tutor_code_updated_at, is_active')
      .eq('auth_user_id', auth.user.id)
      .eq('role', 'lecturer')
      .eq('is_active', true)
      .maybeSingle();
    return unwrap(res) as Profile | null;
  },

  // ---------------------------------------------------------------- sessions
  async sessions(f: SessionFilters, limit = 500): Promise<SessionSummary[]> {
    let q = supabase.from('attendance_session_summary').select('*');
    if (f.moduleId) q = q.eq('module_id', f.moduleId);
    if (f.groupId) q = q.eq('tutorial_group_id', f.groupId);
    if (f.tutorId) q = q.eq('tutor_profile_id', f.tutorId);
    if (f.from) q = q.gte('class_date', f.from);
    if (f.to) q = q.lte('class_date', f.to);
    if (f.apspace) q = q.eq('apspace_status', f.apspace);
    q = q
      .order('class_date', { ascending: false })
      .order('class_time', { ascending: false })
      .order('saved_at', { ascending: false })
      .limit(limit);
    return unwrap(await q) as SessionSummary[];
  },
  async session(id: string): Promise<SessionSummary | null> {
    return unwrap(await supabase.from('attendance_session_summary').select('*').eq('id', id).maybeSingle()) as SessionSummary | null;
  },
  async sessionRecords(sessionIds: string[]): Promise<RecordDetail[]> {
    if (sessionIds.length === 0) return [];
    const out: RecordDetail[] = [];
    for (let i = 0; i < sessionIds.length; i += 100) {
      const chunk = sessionIds.slice(i, i + 100);
      const rows = unwrap(
        await supabase
          .from('attendance_record_details')
          .select('*')
          .in('attendance_session_id', chunk)
          .order('student_name')
          .limit(10000),
      ) as RecordDetail[];
      out.push(...rows);
    }
    return out;
  },
  async searchStudentHistory(term: string): Promise<RecordDetail[]> {
    const t = term.trim().replace(/[%_,()]/g, ' ');
    if (t.length < 2) return [];
    return unwrap(
      await supabase
        .from('attendance_record_details')
        .select('*')
        .or(`student_id.ilike.%${t}%,student_name.ilike.%${t}%`)
        .order('class_date', { ascending: false })
        .limit(300),
    ) as RecordDetail[];
  },
  async enrolledNotRecorded(groupId: string, recordedStudentIds: string[]): Promise<Student[]> {
    const rows = unwrap(
      await supabase
        .from('group_enrolments')
        .select('student:students(id, student_id, full_name, is_active)')
        .eq('tutorial_group_id', groupId)
        .eq('is_active', true),
    ) as unknown as Array<{ student: Student }>;
    const recorded = new Set(recordedStudentIds);
    return rows.map((r) => r.student).filter((s) => s && s.is_active && !recorded.has(s.id));
  },
  async correct(sessionId: string, records: Array<{ student_id: string; status: AttendanceStatus; remark?: string | null }>) {
    const res = unwrap(await supabase.rpc('lecturer_correct_attendance', { p_session_id: sessionId, p_records: records })) as {
      ok: boolean;
      error?: string;
      changed?: number;
    };
    if (!res.ok) throw new Error(res.error ?? 'Correction failed');
    return res;
  },
  async setApspace(sessionIds: string[], status: ApspaceStatus) {
    const res = unwrap(
      await supabase.rpc('lecturer_set_apspace_status', { p_session_ids: sessionIds, p_status: status }),
    ) as { ok: boolean; updated: number; error?: string };
    if (!res.ok) throw new Error(res.error ?? 'Update failed');
    return res;
  },
  async sessionAudit(sessionId: string): Promise<AuditLog[]> {
    return unwrap(
      await supabase.from('audit_logs').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }),
    ) as AuditLog[];
  },
  async auditLogs(action?: string, limit = 200): Promise<AuditLog[]> {
    let q = supabase.from('audit_logs').select('*');
    if (action) q = q.eq('action', action);
    return unwrap(await q.order('created_at', { ascending: false }).limit(limit)) as AuditLog[];
  },

  // ---------------------------------------------------------------- master data
  async modules(): Promise<Module[]> {
    return unwrap(await supabase.from('modules').select('*').order('module_code')) as Module[];
  },
  async saveModule(m: Partial<Module> & { module_code: string; short_name: string; module_name: string }) {
    const payload = {
      module_code: m.module_code.trim(),
      short_name: m.short_name.trim(),
      module_name: m.module_name.trim(),
      intake_semester: m.intake_semester?.trim() || null,
      is_active: m.is_active ?? true,
    };
    if (m.id) return unwrap(await supabase.from('modules').update(payload).eq('id', m.id).select().single());
    return unwrap(await supabase.from('modules').insert(payload).select().single());
  },
  async groups(): Promise<TutorialGroupOverview[]> {
    return unwrap(
      await supabase.from('tutorial_group_overview').select('*').order('module_code').order('tutorial_code'),
    ) as TutorialGroupOverview[];
  },
  async saveGroup(g: { id?: string; module_id: string; group_number: string; tutorial_code: string; display_name?: string | null; is_active?: boolean }) {
    const payload = {
      module_id: g.module_id,
      group_number: g.group_number.trim(),
      tutorial_code: g.tutorial_code.trim().toUpperCase(),
      display_name: g.display_name?.trim() || null,
      is_active: g.is_active ?? true,
    };
    if (g.id) return unwrap(await supabase.from('tutorial_groups').update(payload).eq('id', g.id).select().single());
    return unwrap(await supabase.from('tutorial_groups').insert(payload).select().single());
  },
  async setGroupActive(id: string, is_active: boolean) {
    return unwrap(await supabase.from('tutorial_groups').update({ is_active }).eq('id', id).select().single());
  },
  async groupRoster(groupId: string): Promise<Array<{ enrolment: Enrolment; student: Student }>> {
    const rows = unwrap(
      await supabase
        .from('group_enrolments')
        .select('id, tutorial_group_id, student_id, is_active, enrolled_at, student:students(id, student_id, full_name, is_active)')
        .eq('tutorial_group_id', groupId),
    ) as unknown as Array<Enrolment & { student: Student }>;
    return rows
      .map(({ student, ...enrolment }) => ({ enrolment, student }))
      .sort((a, b) => a.student.full_name.localeCompare(b.student.full_name, 'en', { sensitivity: 'base' }));
  },

  async students(search: string, includeInactive: boolean): Promise<Student[]> {
    let q = supabase.from('students').select('id, student_id, full_name, is_active');
    const t = search.trim().replace(/[%_,()]/g, ' ');
    if (t) q = q.or(`student_id.ilike.%${t}%,full_name.ilike.%${t}%`);
    if (!includeInactive) q = q.eq('is_active', true);
    return unwrap(await q.order('full_name').limit(500)) as Student[];
  },
  async saveStudent(s: { id?: string; student_id: string; full_name: string; is_active?: boolean }) {
    const payload = {
      student_id: s.student_id.replace(/\s+/g, '').toUpperCase(),
      full_name: s.full_name.trim().replace(/\s+/g, ' '),
      is_active: s.is_active ?? true,
    };
    if (s.id) return unwrap(await supabase.from('students').update(payload).eq('id', s.id).select().single()) as Student;
    return unwrap(await supabase.from('students').insert(payload).select().single()) as Student;
  },
  async studentEnrolments(studentId: string): Promise<Enrolment[]> {
    return unwrap(await supabase.from('group_enrolments').select('*').eq('student_id', studentId)) as Enrolment[];
  },
  /**
   * Enrols a student into a group, deactivating any other active enrolment in the
   * same module (a student belongs to one tutorial group per module, BR-005).
   */
  async enrol(studentId: string, group: TutorialGroupOverview, allGroups: TutorialGroupOverview[]) {
    const sameModule = allGroups.filter((g) => g.module_id === group.module_id && g.id !== group.id).map((g) => g.id);
    if (sameModule.length) {
      unwrap(
        await supabase
          .from('group_enrolments')
          .update({ is_active: false })
          .eq('student_id', studentId)
          .eq('is_active', true)
          .in('tutorial_group_id', sameModule)
          .select(),
      );
    }
    return unwrap(
      await supabase
        .from('group_enrolments')
        .upsert({ tutorial_group_id: group.id, student_id: studentId, is_active: true }, { onConflict: 'tutorial_group_id,student_id' })
        .select()
        .single(),
    );
  },
  async setEnrolmentActive(id: string, is_active: boolean) {
    return unwrap(await supabase.from('group_enrolments').update({ is_active }).eq('id', id).select().single());
  },

  async tutorProfiles(): Promise<Profile[]> {
    return unwrap(
      await supabase
        .from('profiles')
        .select('id, auth_user_id, full_name, role, tutor_code_prefix, tutor_code_updated_at, is_active')
        .eq('role', 'tutor')
        .order('full_name'),
    ) as Profile[];
  },
  async setTutorActive(id: string, is_active: boolean) {
    return unwrap(await supabase.from('profiles').update({ is_active }).eq('id', id).select('id').single());
  },
  async renameTutor(id: string, full_name: string) {
    return unwrap(await supabase.from('profiles').update({ full_name: full_name.trim() }).eq('id', id).select('id').single());
  },
  async assignments(): Promise<Assignment[]> {
    return unwrap(await supabase.from('tutor_group_assignments').select('*').eq('is_active', true)) as Assignment[];
  },
  async assign(tutorId: string, groupId: string, temporary: boolean, note: string) {
    return unwrap(
      await supabase
        .from('tutor_group_assignments')
        .insert({ tutor_profile_id: tutorId, tutorial_group_id: groupId, is_temporary_cover: temporary, note: note.trim() || null })
        .select()
        .single(),
    );
  },
  async unassign(id: string) {
    return unwrap(await supabase.from('tutor_group_assignments').update({ is_active: false }).eq('id', id).select().single());
  },

  /** Tutor-code operations run in a Netlify Function (hashing needs server secrets). */
  async tutorCodeAction(body: { action: 'create' | 'regenerate'; tutor_id?: string; full_name?: string; prefix: string }) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Please sign in again.');
    let res: Response;
    try {
      res = await fetch('/api/admin/tutors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Network problem – the code was not generated. Please retry.');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      throw new Error(json.error === 'PREFIX_IN_USE' ? 'Another active tutor already uses that code prefix.' : json.error ?? 'Request failed');
    }
    return json as { ok: true; code: string; tutor: { id: string; full_name: string; tutor_code_prefix: string } };
  },
  async tutorCodeStatus(): Promise<Array<{ id: string; code_set: boolean }>> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return [];
    try {
      const res = await fetch('/api/admin/tutors', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      return json.ok ? json.tutors : [];
    } catch {
      return [];
    }
  },

  // ---------------------------------------------------------------- import
  async importRoster(args: {
    moduleId: string;
    rows: NormalizedRosterRow[];
    filename: string;
    dryRun: boolean;
    deactivateMissing: boolean;
    excludedRows: number;
  }) {
    const res = unwrap(
      await supabase.rpc('lecturer_import_roster', {
        p_module_id: args.moduleId,
        p_rows: args.rows,
        p_filename: args.filename,
        p_dry_run: args.dryRun,
        p_deactivate_missing: args.deactivateMissing,
        p_excluded_rows: args.excludedRows,
      }),
    ) as ImportSummary;
    if (!res.ok) throw new Error(res.error ?? 'Import failed');
    return res;
  },
  async importBatches() {
    return unwrap(await supabase.from('import_batches').select('*').order('uploaded_at', { ascending: false }).limit(20)) as Array<
      Record<string, unknown> & { id: string; filename: string; uploaded_at: string }
    >;
  },
};

export interface ImportSummary {
  ok: boolean;
  error?: string;
  dry_run: boolean;
  module_code: string;
  rows_processed: number;
  valid_rows: number;
  students_created: number;
  students_updated: number;
  students_unchanged: number;
  enrolments_created: number;
  enrolments_reactivated: number;
  enrolments_moved: number;
  enrolments_deactivated: number;
  errors: Array<{ row: number; student_id: string; error: string }>;
  group_counts: Record<string, number>;
}

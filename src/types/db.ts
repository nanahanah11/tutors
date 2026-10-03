import type { ApspaceStatus } from '../shared/apspace';
import type { AttendanceStatus } from '../shared/roster';

export interface Module {
  id: string;
  module_code: string;
  short_name: string;
  module_name: string;
  intake_semester: string | null;
  is_active: boolean;
}

export interface TutorialGroupOverview {
  id: string;
  module_id: string;
  module_code: string;
  module_short_name: string;
  group_number: string;
  tutorial_code: string;
  display_name: string | null;
  is_active: boolean;
  active_students: number;
  assigned_tutors: string;
}

export interface Profile {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  role: 'lecturer' | 'tutor';
  tutor_code_prefix: string | null;
  tutor_code_updated_at: string | null;
  is_active: boolean;
}

export interface Student {
  id: string;
  student_id: string;
  full_name: string;
  is_active: boolean;
}

export interface Enrolment {
  id: string;
  tutorial_group_id: string;
  student_id: string;
  is_active: boolean;
  enrolled_at: string;
}

export interface Assignment {
  id: string;
  tutor_profile_id: string;
  tutorial_group_id: string;
  is_active: boolean;
  is_temporary_cover: boolean;
  note: string | null;
  assigned_at: string;
}

export interface SessionSummary {
  id: string;
  module_id: string;
  module_code: string;
  module_short_name: string;
  module_name: string;
  tutorial_group_id: string;
  group_number: string;
  tutorial_code: string;
  tutor_profile_id: string;
  tutor_name_snapshot: string;
  tutor_code_prefix: string | null;
  class_date: string;
  class_time: string;
  saved_at: string;
  last_tutor_edit_at: string | null;
  last_lecturer_edit_at: string | null;
  apspace_status: ApspaceStatus;
  apspace_keyed_at: string | null;
  apspace_keyed_by: string | null;
  apspace_keyed_by_name: string | null;
  created_at: string;
  updated_at: string;
  total_students: number;
  present_count: number;
  absent_count: number;
}

export interface RecordDetail {
  id: string;
  attendance_session_id: string;
  class_date: string;
  class_time: string;
  module_code: string;
  module_short_name: string;
  group_number: string;
  tutorial_code: string;
  tutor_profile_id: string;
  tutor_name_snapshot: string;
  apspace_status: ApspaceStatus;
  student_uuid: string;
  student_id: string;
  student_name: string;
  status: AttendanceStatus;
  remark: string | null;
  marked_by_profile_id: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_profile_id: string | null;
  actor_name: string | null;
  entity_type: string;
  entity_id: string | null;
  session_id: string | null;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

/** Shapes returned by the tutor API (Netlify Functions). */
export interface TutorClass {
  tutorial_group_id: string;
  tutorial_code: string;
  group_number: string;
  module_code: string;
  module_short_name: string;
  module_name: string;
  student_count: number;
}

export interface TutorContext {
  ok: true;
  today: string;
  tutor: { id: string; full_name: string };
  classes: TutorClass[];
}

export interface TutorSession {
  id: string;
  module_code: string;
  module_short_name: string;
  module_name: string;
  tutorial_group_id: string;
  tutorial_code: string;
  group_number: string;
  tutor_profile_id: string;
  tutor_name: string;
  class_date: string;
  class_time: string;
  saved_at: string;
  updated_at: string;
  last_tutor_edit_at: string | null;
  apspace_status: ApspaceStatus;
  tutor_editable: boolean;
  total_students: number;
  present_count: number;
  absent_count: number;
}

export interface TutorSessionStudent {
  id: string;
  student_id: string;
  full_name: string;
  status: AttendanceStatus | null;
  remark: string | null;
}

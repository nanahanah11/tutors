import { ATTENDANCE_EXPORT_HEADERS, toCsv } from '../shared/csv';
import { apspaceLabel } from '../shared/apspace';
import { formatDate, formatTime } from '../shared/time';
import type { RecordDetail } from '../types/db';

/** Student-level attendance CSV (FR-EXP-001..003). */
export function attendanceCsv(records: RecordDetail[]): string {
  const sorted = [...records].sort(
    (a, b) =>
      b.class_date.localeCompare(a.class_date) ||
      b.class_time.localeCompare(a.class_time) ||
      a.tutorial_code.localeCompare(b.tutorial_code) ||
      a.student_name.localeCompare(b.student_name, 'en', { sensitivity: 'base' }),
  );
  return toCsv(
    ATTENDANCE_EXPORT_HEADERS,
    sorted.map((r) => [
      r.module_code,
      r.tutorial_code,
      r.group_number,
      formatDate(r.class_date),
      formatTime(r.class_time),
      r.tutor_name_snapshot,
      r.student_id,
      r.student_name,
      r.status === 'present' ? 'Present' : 'Absent',
      r.remark ?? '',
      apspaceLabel(r.apspace_status),
    ]),
  );
}

export function exportFilename(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `${prefix}-${stamp}.csv`.replace(/[^A-Za-z0-9._-]/g, '_');
}

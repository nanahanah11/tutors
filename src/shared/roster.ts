/** Roster display + attendance-marking rules (FR-STU-005..007, FR-ATT-002..011). */
export type AttendanceStatus = 'present' | 'absent';

export interface RosterStudent {
  /** students.id (uuid) */
  id: string;
  /** TP number / student ID */
  student_id: string;
  full_name: string;
}

export type Marks = Record<string, AttendanceStatus | undefined>;

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** A–Z by full name (case-insensitive), TP number as tie-breaker. Does not mutate. */
export function sortStudents<T extends RosterStudent>(students: readonly T[]): T[] {
  return [...students].sort(
    (a, b) => collator.compare(a.full_name, b.full_name) || collator.compare(a.student_id, b.student_id),
  );
}

/**
 * Case-insensitive partial match on name or TP number. Whitespace in the query is
 * collapsed; an empty query returns the full (already sorted) list.
 */
export function filterStudents<T extends RosterStudent>(students: readonly T[], query: string): T[] {
  const q = query.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!q) return [...students];
  return students.filter(
    (s) =>
      s.full_name.replace(/\s+/g, ' ').toLowerCase().includes(q) ||
      s.student_id.toLowerCase().includes(q.replace(/\s/g, '')),
  );
}

export interface AttendanceCounts {
  total: number;
  present: number;
  absent: number;
  unmarked: number;
}

export function countAttendance(students: readonly RosterStudent[], marks: Marks): AttendanceCounts {
  let present = 0;
  let absent = 0;
  for (const s of students) {
    const m = marks[s.id];
    if (m === 'present') present++;
    else if (m === 'absent') absent++;
  }
  return { total: students.length, present, absent, unmarked: students.length - present - absent };
}

export function markAll(students: readonly RosterStudent[], marks: Marks, status: AttendanceStatus): Marks {
  const next: Marks = { ...marks };
  for (const s of students) next[s.id] = status;
  return next;
}

export interface SessionSetup {
  tutorial_group_id: string;
  class_date: string;
  class_time: string;
}

/** Client-side mirror of the server validation (PRD §20.2). Returns human-readable problems. */
export function validateAttendance(
  setup: Partial<SessionSetup>,
  students: readonly RosterStudent[] | null,
  marks: Marks,
): string[] {
  const problems: string[] = [];
  if (!setup.tutorial_group_id) problems.push('Select a Class / Subject.');
  if (!setup.class_date) problems.push('Select the class date.');
  if (!setup.class_time) problems.push('Enter the class time.');
  if (!students) {
    problems.push('The student roster has not been loaded.');
    return problems;
  }
  if (students.length === 0) problems.push('This class has no active students. Please inform Ms Aida.');
  const { unmarked } = countAttendance(students, marks);
  if (unmarked > 0) {
    problems.push(`${unmarked} student${unmarked === 1 ? ' is' : 's are'} still unmarked.`);
  }
  return problems;
}

export function buildRecordsPayload(
  students: readonly RosterStudent[],
  marks: Marks,
  remarks: Record<string, string | undefined> = {},
) {
  return students.map((s) => {
    const remark = remarks[s.id]?.trim();
    return { student_id: s.id, status: marks[s.id] as AttendanceStatus, ...(remark ? { remark } : {}) };
  });
}

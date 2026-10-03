import { describe, expect, it } from 'vitest';
import {
  buildRecordsPayload,
  countAttendance,
  filterStudents,
  markAll,
  sortStudents,
  validateAttendance,
  type Marks,
} from '../../src/shared/roster';

const roster = [
  { id: 'u3', student_id: 'TP070003', full_name: 'zainab Ismail' },
  { id: 'u1', student_id: 'TP070001', full_name: 'Ahmad Bin Ali' },
  { id: 'u4', student_id: 'TP070004', full_name: 'Siti Nur Aisyah' },
  { id: 'u2', student_id: 'TP070002', full_name: 'ahmad bin ali' },
  { id: 'u5', student_id: 'TP012345', full_name: 'Chong Wei Jie' },
];

describe('alphabetical roster (FR-STU-006, AC-004)', () => {
  it('sorts A–Z by full name, case-insensitive, TP as tie-break', () => {
    expect(sortStudents(roster).map((s) => s.id)).toEqual(['u1', 'u2', 'u5', 'u4', 'u3']);
  });
  it('does not mutate the input', () => {
    const copy = [...roster];
    sortStudents(roster);
    expect(roster).toEqual(copy);
  });
});

describe('search by name or TP number (FR-ATT-006, AC-005)', () => {
  const sorted = sortStudents(roster);
  it('matches partial names case-insensitively', () => {
    expect(filterStudents(sorted, 'AHMAD').map((s) => s.id)).toEqual(['u1', 'u2']);
    expect(filterStudents(sorted, 'nur ais').map((s) => s.id)).toEqual(['u4']);
  });
  it('matches partial TP numbers', () => {
    expect(filterStudents(sorted, 'tp0123').map((s) => s.id)).toEqual(['u5']);
    expect(filterStudents(sorted, '0700').map((s) => s.id)).toEqual(['u1', 'u2', 'u4', 'u3']);
  });
  it('empty search restores the full alphabetical list', () => {
    expect(filterStudents(sorted, '   ')).toEqual(sorted);
  });
  it('keeps marks independent of filtering', () => {
    let marks: Marks = {};
    marks = markAll(filterStudents(sorted, 'ahmad'), marks, 'absent');
    const cleared = filterStudents(sorted, '');
    expect(countAttendance(cleared, marks)).toEqual({ total: 5, present: 0, absent: 2, unmarked: 3 });
  });
});

describe('counters and validation (FR-ATT-008, FR-ATT-011, AC-006)', () => {
  it('counts total/present/absent/unmarked', () => {
    const marks: Marks = { u1: 'present', u2: 'absent', u3: 'present' };
    expect(countAttendance(roster, marks)).toEqual({ total: 5, present: 2, absent: 1, unmarked: 2 });
  });
  it('blocks saving when one student is unmarked', () => {
    const marks = markAll(roster.slice(1), {}, 'present');
    const problems = validateAttendance(
      { tutorial_group_id: 'g', class_date: '2026-10-03', class_time: '10:45' },
      roster,
      marks,
    );
    expect(problems).toEqual(['1 student is still unmarked.']);
  });
  it('requires class, date, time and a loaded roster', () => {
    expect(validateAttendance({}, null, {})).toEqual([
      'Select a Class / Subject.',
      'Select the class date.',
      'Enter the class time.',
      'The student roster has not been loaded.',
    ]);
  });
  it('passes when complete', () => {
    const marks = markAll(roster, {}, 'present');
    expect(validateAttendance({ tutorial_group_id: 'g', class_date: '2026-10-03', class_time: '10:45' }, roster, marks)).toEqual([]);
  });
  it('builds the API payload with optional remarks', () => {
    const marks = markAll(roster.slice(0, 2), {}, 'absent');
    expect(buildRecordsPayload(roster.slice(0, 2), marks, { u3: ' MC ' })).toEqual([
      { student_id: 'u3', status: 'absent', remark: 'MC' },
      { student_id: 'u1', status: 'absent' },
    ]);
  });
});

/**
 * Attendance marking table (PRD §11.4): alphabetical roster, TP number beside the name,
 * search by name/TP, mutually exclusive Present/Absent controls, live counters.
 * Marks live in the parent so filtering/clearing the search never loses selections.
 */
import { useMemo, useState } from 'react';
import {
  countAttendance,
  filterStudents,
  markAll,
  sortStudents,
  type AttendanceStatus,
  type Marks,
  type RosterStudent,
} from '../../shared/roster';
import { Stat } from '../ui';

interface Props {
  students: RosterStudent[];
  marks: Marks;
  onMarksChange: (marks: Marks) => void;
  remarks?: Record<string, string | undefined>;
  onRemarksChange?: (remarks: Record<string, string | undefined>) => void;
  readOnly?: boolean;
  allowMarkAll?: boolean;
}

export function AttendanceMarker({
  students,
  marks,
  onMarksChange,
  remarks = {},
  onRemarksChange,
  readOnly = false,
  allowMarkAll = true,
}: Props) {
  const [query, setQuery] = useState('');
  const [openRemarks, setOpenRemarks] = useState<Record<string, boolean>>({});
  const sorted = useMemo(() => sortStudents(students), [students]);
  const visible = useMemo(() => filterStudents(sorted, query), [sorted, query]);
  const counts = countAttendance(sorted, marks);

  const setMark = (id: string, status: AttendanceStatus) => onMarksChange({ ...marks, [id]: status });

  return (
    <div>
      <div className="stats" aria-label="Attendance summary">
        <Stat label="Total" value={counts.total} />
        <Stat label="Present" value={counts.present} tone="present" />
        <Stat label="Absent" value={counts.absent} tone="absent" />
        <Stat label="Unmarked" value={counts.unmarked} tone="unmarked" />
      </div>

      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <div className="field" style={{ flex: '1 1 280px', margin: 0 }}>
          <label htmlFor="roster-search">Search student name or TP number</label>
          <input
            id="roster-search"
            type="search"
            value={query}
            placeholder="e.g. Ahmad or TP012345"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {!readOnly && allowMarkAll && (
          <div className="row" style={{ alignSelf: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => onMarksChange(markAll(sorted, marks, 'present'))}>
              Mark All Present
            </button>
            <button type="button" className="btn" onClick={() => onMarksChange(markAll(sorted, marks, 'absent'))}>
              Mark All Absent
            </button>
          </div>
        )}
      </div>
      {query && (
        <p className="small muted" aria-live="polite">
          Showing {visible.length} of {sorted.length} students.{' '}
          <button type="button" className="btn-link" onClick={() => setQuery('')}>
            Clear search
          </button>
        </p>
      )}

      <div className="table-wrap">
        <table className="roster-table">
          <caption className="sr-only">Class roster sorted alphabetically by student name</caption>
          <thead>
            <tr>
              <th scope="col">Student Name</th>
              <th scope="col">TP Number</th>
              <th scope="col">Present / Absent</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">
                  No students match “{query}”.
                </td>
              </tr>
            )}
            {visible.map((s) => {
              const m = marks[s.id];
              const remark = remarks[s.id] ?? '';
              const showRemark = openRemarks[s.id] || !!remark;
              return (
                <tr key={s.id} className={m ? '' : 'unmarked'}>
                  <td className="student-name" id={`name-${s.id}`}>
                    {s.full_name}
                  </td>
                  <td className="tp">{s.student_id}</td>
                  <td className="marks">
                    <div className="mark-group" role="radiogroup" aria-labelledby={`name-${s.id}`}>
                      <label className="mark-option present">
                        <input
                          type="radio"
                          name={`mark-${s.id}`}
                          value="present"
                          checked={m === 'present'}
                          disabled={readOnly}
                          onChange={() => setMark(s.id, 'present')}
                        />
                        <span>
                          <span className="mark-icon" aria-hidden="true">✔</span> Present
                        </span>
                      </label>
                      <label className="mark-option absent">
                        <input
                          type="radio"
                          name={`mark-${s.id}`}
                          value="absent"
                          checked={m === 'absent'}
                          disabled={readOnly}
                          onChange={() => setMark(s.id, 'absent')}
                        />
                        <span>
                          <span className="mark-icon" aria-hidden="true">✘</span> Absent
                        </span>
                      </label>
                    </div>
                    {onRemarksChange && !readOnly && !showRemark && (
                      <button
                        type="button"
                        className="btn-link small"
                        style={{ display: 'block', marginTop: '0.35rem' }}
                        onClick={() => setOpenRemarks({ ...openRemarks, [s.id]: true })}
                      >
                        Add remark
                      </button>
                    )}
                    {onRemarksChange && showRemark && (
                      <input
                        className="remark-input"
                        style={{ display: 'block', maxWidth: 440 }}
                        aria-label={`Remark for ${s.full_name}`}
                        placeholder="Remark (optional)"
                        maxLength={500}
                        value={remark}
                        disabled={readOnly}
                        onChange={(e) => onRemarksChange({ ...remarks, [s.id]: e.target.value })}
                      />
                    )}
                    {!onRemarksChange && remark && <div className="small muted">Remark: {remark}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

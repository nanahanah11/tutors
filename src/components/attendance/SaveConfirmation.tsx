/** Save confirmation summary (PRD §11.5). */
import type { RosterStudent, Marks } from '../../shared/roster';
import { countAttendance, sortStudents } from '../../shared/roster';
import { formatDate, formatTime } from '../../shared/time';
import { Modal } from '../ui';

interface Props {
  open: boolean;
  classLabel: string;
  classDate: string;
  classTime: string;
  tutorName: string;
  students: RosterStudent[];
  marks: Marks;
  saving: boolean;
  isEdit?: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export function SaveConfirmation({ open, classLabel, classDate, classTime, tutorName, students, marks, saving, isEdit, onBack, onConfirm }: Props) {
  const c = countAttendance(students, marks);
  const absentees = sortStudents(students.filter((s) => marks[s.id] === 'absent'));
  return (
    <Modal
      open={open}
      title={isEdit ? 'Confirm attendance changes' : 'Confirm attendance'}
      onClose={() => !saving && onBack()}
      footer={
        <>
          <button type="button" className="btn" onClick={onBack} disabled={saving}>
            Back to Edit
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : 'Confirm Save'}
          </button>
        </>
      }
    >
      <dl className="kv">
        <dt>Class / Subject</dt>
        <dd>{classLabel}</dd>
        <dt>Date / time</dt>
        <dd>
          {formatDate(classDate)}, {formatTime(classTime)}
        </dd>
        <dt>Tutor</dt>
        <dd>{tutorName}</dd>
        <dt>Total students</dt>
        <dd>{c.total}</dd>
        <dt>Present</dt>
        <dd>{c.present}</dd>
        <dt>Absent</dt>
        <dd>{c.absent}</dd>
      </dl>
      <h3>Absent students ({absentees.length})</h3>
      {absentees.length === 0 ? (
        <p className="muted">No students marked absent.</p>
      ) : (
        <ul>
          {absentees.map((s) => (
            <li key={s.id}>
              {s.full_name} <span className="mono muted">({s.student_id})</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

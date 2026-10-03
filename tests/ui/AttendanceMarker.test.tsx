// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttendanceMarker } from '../../src/components/attendance/AttendanceMarker';
import { RosterNotice } from '../../src/components/attendance/RosterNotice';
import type { Marks, RosterStudent } from '../../src/shared/roster';

const students: RosterStudent[] = [
  { id: 'c', student_id: 'TP070003', full_name: 'Zainab Ismail' },
  { id: 'a', student_id: 'TP070001', full_name: 'Ahmad Bin Ali' },
  { id: 'b', student_id: 'TP012345', full_name: 'Mei Ling Tan' },
];

function Harness() {
  const [marks, setMarks] = useState<Marks>({});
  return (
    <>
      <RosterNotice />
      <AttendanceMarker students={students} marks={marks} onMarksChange={setMarks} />
    </>
  );
}

const rows = () => screen.getAllByRole('row').slice(1);

describe('AttendanceMarker (§11.4, AC-004, AC-005, AC-011)', () => {
  it('shows students A–Z with the TP number beside the name', () => {
    render(<Harness />);
    expect(rows().map((r) => within(r).getAllByRole('cell').slice(0, 2).map((c) => c.textContent))).toEqual([
      ['Ahmad Bin Ali', 'TP070001'],
      ['Mei Ling Tan', 'TP012345'],
      ['Zainab Ismail', 'TP070003'],
    ]);
  });

  it('shows the mandatory roster notice and no roster-editing controls', () => {
    render(<Harness />);
    expect(screen.getByText('Any changes related to the student list, please let Ms Aida know ASAP.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add student|remove|delete|move/i })).toBeNull();
  });

  it('present/absent are mutually exclusive and counters update live', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const ahmad = screen.getByRole('radiogroup', { name: 'Ahmad Bin Ali' });
    await user.click(within(ahmad).getByLabelText(/Present/));
    await user.click(within(ahmad).getByLabelText(/Absent/));
    expect(within(ahmad).getByLabelText(/Absent/)).toBeChecked();
    expect(within(ahmad).getByLabelText(/Present/)).not.toBeChecked();
    const summary = screen.getByLabelText('Attendance summary');
    expect(summary).toHaveTextContent('Total3');
    expect(summary).toHaveTextContent('Absent1');
    expect(summary).toHaveTextContent('Unmarked2');
  });

  it('search filters by name or TP and keeps selections when cleared (AC-005)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const search = screen.getByLabelText('Search student name or TP number');
    await user.type(search, 'tp0123');
    expect(rows()).toHaveLength(1);
    await user.click(within(screen.getByRole('radiogroup', { name: 'Mei Ling Tan' })).getByLabelText(/Absent/));
    await user.clear(search);
    await user.type(search, 'ZAIN');
    expect(rows().map((r) => r.cells[0].textContent)).toEqual(['Zainab Ismail']);
    await user.clear(search);
    expect(rows()).toHaveLength(3);
    expect(within(screen.getByRole('radiogroup', { name: 'Mei Ling Tan' })).getByLabelText(/Absent/)).toBeChecked();
  });

  it('Mark All Present marks everyone, individuals can still be changed (FR-ATT-012)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Mark All Present' }));
    expect(screen.getByLabelText('Attendance summary')).toHaveTextContent('Present3');
    await user.click(within(screen.getByRole('radiogroup', { name: 'Zainab Ismail' })).getByLabelText(/Absent/));
    expect(screen.getByLabelText('Attendance summary')).toHaveTextContent('Present2');
  });

  it('read-only mode disables the controls', () => {
    render(<AttendanceMarker students={students} marks={{ a: 'present' }} onMarksChange={() => {}} readOnly />);
    for (const r of screen.getAllByRole('radio')) expect(r).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Mark All Present' })).toBeNull();
  });
});

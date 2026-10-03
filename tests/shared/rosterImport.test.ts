import { describe, expect, it } from 'vitest';
import { normalizeGroupNumber, parseCsv, parseRosterGrid, RosterHeaderError, rowsForModule } from '../../src/shared/rosterImport';

describe('XLSX-style roster grid (PRD §18.1, §18.3)', () => {
  // Mirrors the supplied workbook layout: Name | Student ID | Tutorial Group | Assignment Group,
  // with a GROUP/TOTAL helper block to the right that must be ignored.
  const grid = [
    ['Name', 'Student ID', 'Tutorial Group', 'Assignment Group', null, 'GROUP', 'TOTAL'],
    ['  Ahmad  Bin Ali ', 'tp012345', 40, 'A1', null, 38, 44],
    ['Siti Nur Aisyah', 'TP012346', '40.0', 'A2', null, 39, 35],
    ['Ungrouped Student', 'TP012399', null, 'A3', null, 40, 41],
    ['Lim Wei', 'TP012347', 'CT046-3-2-SDM-T-41', '', null, null, null],
    [null, null, null, null, null, 'TOTAL', 178],
    ['Duplicate Ahmad', 'TP012345', 39, '', null, null, null],
    ['Bad Group', 'TP012348', 'abc', '', null, null, null],
    ['', 'TP012349', 39, '', null, null, null],
  ];

  it('normalises rows and excludes the ungrouped row (FR-STU-010, BR-020)', () => {
    const r = parseRosterGrid(grid);
    expect(r.headerRow).toBe(1);
    expect(r.rows).toEqual([
      { row_no: 2, student_id: 'TP012345', student_name: 'Ahmad Bin Ali', group_number: '40' },
      { row_no: 3, student_id: 'TP012346', student_name: 'Siti Nur Aisyah', group_number: '40' },
      { row_no: 5, student_id: 'TP012347', student_name: 'Lim Wei', group_number: '41' },
    ]);
    expect(r.excluded.map((e) => e.student_id)).toEqual(['TP012399']);
    expect(r.groupCounts).toEqual({ '40': 2, '41': 1 });
  });

  it('flags duplicates, invalid groups and missing names (FR-STU-009)', () => {
    const r = parseRosterGrid(grid);
    expect(r.errors.map((e) => [e.row_no, e.reason.split(' (')[0]])).toEqual([
      [7, 'Duplicate student ID'],
      [8, 'Invalid tutorial group "abc"'],
      [9, 'Missing student name'],
    ]);
    expect(r.totalDataRows).toBe(7);
  });

  it('finds the header even below title rows', () => {
    const r = parseRosterGrid([['CT046 Student List'], [], ['Name', 'Student ID', 'Tutorial Group'], ['A', 'TP1', 38]]);
    expect(r.headerRow).toBe(3);
    expect(r.rows).toHaveLength(1);
  });

  it('rejects files without the required headers', () => {
    expect(() => parseRosterGrid([['Foo', 'Bar']])).toThrow(RosterHeaderError);
  });
});

describe('normalised CSV format (§18.2)', () => {
  const csv =
    'module_code,group_number,student_id,student_name\r\n' +
    'CT046-3-2-SDM,40,TP012345,Ahmad Bin Ali\r\n' +
    'CT046-3-2-SDM,40,TP012346,"Siti, Nur Aisyah"\r\n' +
    'AAPP003-4-2-ISWE,7,TP012347,Example Student\r\n';

  it('parses quoted CSV', () => {
    expect(parseCsv(csv)[2]).toEqual(['CT046-3-2-SDM', '40', 'TP012346', 'Siti, Nur Aisyah']);
    expect(parseCsv('a,"he said ""hi"""\n')).toEqual([['a', 'he said "hi"']]);
  });

  it('splits rows by module_code', () => {
    const r = parseRosterGrid(parseCsv(csv));
    const { rows, otherModule } = rowsForModule(r, 'CT046-3-2-SDM');
    expect(rows.map((x) => x.student_id)).toEqual(['TP012345', 'TP012346']);
    expect(otherModule.map((x) => x.student_id)).toEqual(['TP012347']);
  });
});

describe('group number normalisation', () => {
  it.each([
    [40, '40'],
    ['40.0', '40'],
    ['07', '7'],
    ['T-9', '9'],
    ['AAPP003-4-2-ISWE-T-7', '7'],
    ['', null],
    ['Group A', null],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeGroupNumber(input as string | number)).toBe(expected);
  });
});

/**
 * Student roster import normalisation (PRD §18). Pure functions shared by the
 * lecturer Import screen and the deployment CLI (scripts/import-roster.ts).
 *
 * Input is a 2-D grid of cell values (from XLSX via read-excel-file, or CSV).
 * Only the mapped row-level columns are read; helper/summary cells elsewhere in
 * the sheet (e.g. the SDM workbook's GROUP/TOTAL block) are ignored.
 */
export type Cell = string | number | boolean | Date | null | undefined;

export interface NormalizedRosterRow {
  row_no: number;
  student_id: string;
  student_name: string;
  group_number: string;
  module_code?: string;
}

export interface RosterIssue {
  row_no: number;
  student_id: string;
  student_name: string;
  reason: string;
}

export interface RosterParseResult {
  headerRow: number;
  columns: { name: number; studentId: number; group: number; module: number | null };
  rows: NormalizedRosterRow[];
  /** Rows with no tutorial group – excluded from the active roster (FR-STU-010, BR-020). */
  excluded: RosterIssue[];
  /** Malformed rows / duplicates that need correction (FR-STU-009). */
  errors: RosterIssue[];
  totalDataRows: number;
  groupCounts: Record<string, number>;
}

/** Explicit workbook-to-module mapping for the initial deployment (§18.1). */
export const INITIAL_WORKBOOKS: Record<string, { moduleCode: string; sheet: string }> = {
  'CT046_Student_List.xlsx': { moduleCode: 'CT046-3-2-SDM', sheet: 'Students' },
  'AAPP003_ISWE_Student_List.xlsx': { moduleCode: 'AAPP003-4-2-ISWE', sheet: 'Roster' },
};

const HEADER_ALIASES = {
  name: ['name', 'student name', 'student_name', 'full name', 'full_name'],
  studentId: ['student id', 'student_id', 'studentid', 'tp number', 'tp no', 'tp', 'id'],
  group: ['tutorial group', 'group_number', 'group number', 'tutorial_group', 'group', 'tutorial'],
  module: ['module_code', 'module code', 'module'],
};

function norm(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/ /g, ' ').trim();
}

function headerKey(v: Cell): string {
  return norm(v).toLowerCase().replace(/\s+/g, ' ');
}

function findCol(header: Cell[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = header.findIndex((h) => headerKey(h) === alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** "40", 40, "40.0", "T-40", "CT046-3-2-SDM-T-40" -> "40". Returns null if not a group number. */
export function normalizeGroupNumber(v: Cell): string | null {
  const s = norm(v);
  if (!s) return null;
  let m = /^(\d+)(?:\.0+)?$/.exec(s);
  if (m) return String(Number(m[1]));
  m = /(?:^|-)T-?(\d+)$/i.exec(s);
  if (m) return String(Number(m[1]));
  return null;
}

export function normalizeStudentId(v: Cell): string {
  return norm(v).replace(/\s+/g, '').toUpperCase();
}

export function normalizeName(v: Cell): string {
  return norm(v).replace(/\s+/g, ' ');
}

export class RosterHeaderError extends Error {}

export function parseRosterGrid(grid: Cell[][]): RosterParseResult {
  // Locate the header row within the first 20 rows.
  let headerRow = -1;
  let cols = { name: -1, studentId: -1, group: -1, module: -1 };
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const row = grid[r] ?? [];
    const c = {
      name: findCol(row, HEADER_ALIASES.name),
      studentId: findCol(row, HEADER_ALIASES.studentId),
      group: findCol(row, HEADER_ALIASES.group),
      module: findCol(row, HEADER_ALIASES.module),
    };
    if (c.name >= 0 && c.studentId >= 0 && c.group >= 0) {
      headerRow = r;
      cols = c;
      break;
    }
  }
  if (headerRow < 0) {
    throw new RosterHeaderError(
      'Could not find the required columns. Expected headers: "Name", "Student ID" and "Tutorial Group" ' +
        '(or module_code, group_number, student_id, student_name).',
    );
  }

  const rows: NormalizedRosterRow[] = [];
  const excluded: RosterIssue[] = [];
  const errors: RosterIssue[] = [];
  const seen = new Map<string, number>();
  let totalDataRows = 0;

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const rowNo = r + 1; // 1-based spreadsheet row number
    const studentId = normalizeStudentId(row[cols.studentId]);
    const name = normalizeName(row[cols.name]);
    const rawGroup = row[cols.group];
    if (!studentId && !name) continue; // blank / helper-only row
    totalDataRows++;

    const issue = (reason: string): RosterIssue => ({ row_no: rowNo, student_id: studentId, student_name: name, reason });

    if (!studentId) {
      errors.push(issue('Missing student ID'));
      continue;
    }
    if (!name) {
      errors.push(issue('Missing student name'));
      continue;
    }
    if (!/^[A-Z0-9]+$/.test(studentId)) {
      errors.push(issue('Student ID contains invalid characters'));
      continue;
    }
    if (norm(rawGroup) === '') {
      excluded.push(issue('No tutorial group – excluded from the active roster'));
      continue;
    }
    const group = normalizeGroupNumber(rawGroup);
    if (!group) {
      errors.push(issue(`Invalid tutorial group "${norm(rawGroup)}"`));
      continue;
    }
    if (seen.has(studentId)) {
      errors.push(issue(`Duplicate student ID (also on row ${seen.get(studentId)})`));
      continue;
    }
    seen.set(studentId, rowNo);
    const out: NormalizedRosterRow = { row_no: rowNo, student_id: studentId, student_name: name, group_number: group };
    if (cols.module >= 0) {
      const mc = norm(row[cols.module]).toUpperCase();
      if (mc) out.module_code = mc;
    }
    rows.push(out);
  }

  const groupCounts: Record<string, number> = {};
  for (const r of rows) groupCounts[r.group_number] = (groupCounts[r.group_number] ?? 0) + 1;

  return {
    headerRow: headerRow + 1,
    columns: { name: cols.name, studentId: cols.studentId, group: cols.group, module: cols.module >= 0 ? cols.module : null },
    rows,
    excluded,
    errors,
    totalDataRows,
    groupCounts,
  };
}

/** Keeps only rows for the chosen module when the file carries a module_code column. */
export function rowsForModule(result: RosterParseResult, moduleCode: string): {
  rows: NormalizedRosterRow[];
  otherModule: RosterIssue[];
} {
  const rows: NormalizedRosterRow[] = [];
  const otherModule: RosterIssue[] = [];
  for (const r of result.rows) {
    if (r.module_code && r.module_code !== moduleCode.toUpperCase()) {
      otherModule.push({ row_no: r.row_no, student_id: r.student_id, student_name: r.student_name,
        reason: `Belongs to module ${r.module_code}, not ${moduleCode}` });
    } else rows.push(r);
  }
  return { rows, otherModule };
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      out.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

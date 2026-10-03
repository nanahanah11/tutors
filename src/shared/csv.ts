/** RFC 4180 CSV builder with spreadsheet formula-injection protection. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Neutralise values Excel would treat as formulas (=, +, -, @) unless they are plain numbers.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  // BOM so Excel opens UTF-8 names (e.g. accented characters) correctly
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Columns required by FR-EXP-003. */
export const ATTENDANCE_EXPORT_HEADERS = [
  'Module',
  'Tutorial Class',
  'Group',
  'Date',
  'Time',
  'Tutor',
  'Student ID',
  'Student Name',
  'Status',
  'Remark',
  'APSpace Status',
] as const;

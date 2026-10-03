import { describe, expect, it } from 'vitest';
import { csvEscape, toCsv } from '../../src/shared/csv';
import { apspaceLabel, nextApspaceStatus } from '../../src/shared/apspace';

describe('CSV export (FR-EXP-001..003)', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(csvEscape('Siti, Nur')).toBe('"Siti, Nur"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(null)).toBe('');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvEscape('-5')).toBe('-5');
  });
  it('builds a UTF-8 BOM CSV with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('﻿a,b\r\n1,x\r\n');
  });
});

describe('APSpace status (§19)', () => {
  it('labels', () => {
    expect(apspaceLabel('pending')).toBe('Pending APSpace Entry');
    expect(apspaceLabel('keyed_in')).toBe('Keyed into APSpace');
    expect(apspaceLabel(undefined)).toBe('Pending APSpace Entry');
  });
  it('transitions', () => {
    expect(nextApspaceStatus('pending')).toBe('keyed_in');
    expect(nextApspaceStatus('keyed_in')).toBe('pending');
  });
});

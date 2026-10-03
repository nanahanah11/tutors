import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatTime,
  isTutorEditable,
  isValidDate,
  isValidTime,
  malaysiaToday,
  msUntilEditWindowCloses,
} from '../../src/shared/time';

describe('Malaysia-time same-day edit window (FR-SAVE-005..010)', () => {
  it('uses Asia/Kuala_Lumpur, not UTC, for "today"', () => {
    // 3 Oct 2026 16:30 UTC = 4 Oct 2026 00:30 MYT
    expect(malaysiaToday(new Date('2026-10-03T16:30:00Z'))).toBe('2026-10-04');
    // 3 Oct 2026 15:59:59 UTC = 3 Oct 2026 23:59:59 MYT
    expect(malaysiaToday(new Date('2026-10-03T15:59:59Z'))).toBe('2026-10-03');
  });
  it('allows edits until 11:59:59 PM MYT on the class date (AC-008)', () => {
    expect(isTutorEditable('2026-10-03', new Date('2026-10-03T15:59:59Z'))).toBe(true);
  });
  it('locks edits from 12:00 AM MYT the next day (AC-009)', () => {
    expect(isTutorEditable('2026-10-03', new Date('2026-10-03T16:00:00Z'))).toBe(false);
    expect(isTutorEditable('2026-10-03', new Date('2026-10-05T03:00:00Z'))).toBe(false);
  });
  it('reports time remaining in the window', () => {
    expect(msUntilEditWindowCloses('2026-10-03', new Date('2026-10-03T15:00:00Z'))).toBe(60 * 60 * 1000);
    expect(msUntilEditWindowCloses('2026-10-02', new Date('2026-10-03T15:00:00Z'))).toBe(0);
  });
});

describe('date/time validation and formatting', () => {
  it('validates dates', () => {
    expect(isValidDate('2026-10-03')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('03/10/2026')).toBe(false);
  });
  it('validates times', () => {
    expect(isValidTime('10:45')).toBe(true);
    expect(isValidTime('23:59:00')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:5')).toBe(false);
  });
  it('formats for Malaysian display (§24.2)', () => {
    expect(formatDate('2026-10-03')).toBe('03/10/2026');
    expect(formatTime('10:45')).toBe('10:45 AM');
    expect(formatTime('12:05:00')).toBe('12:05 PM');
    expect(formatTime('00:30')).toBe('12:30 AM');
  });
});

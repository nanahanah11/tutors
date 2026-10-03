import { describe, expect, it } from 'vitest';
import {
  buildTutorCode,
  isValidTutorCodeFormat,
  normalizeTutorCode,
  prefixFromName,
  tutorCodePrefix,
} from '../../src/shared/tutorCode';

describe('tutor code format (FR-AUTH-003)', () => {
  it.each(['MAY123', 'AMIR007', 'ARYA999', 'LATIFA000'])('accepts %s', (c) => {
    expect(isValidTutorCodeFormat(c)).toBe(true);
  });
  it.each(['MAY12', 'MAY1234', 'may123', '123MAY', 'M123', 'MAY 123', 'MAY-123', ''])('rejects %s', (c) => {
    expect(isValidTutorCodeFormat(c)).toBe(false);
  });
  it('normalises case and whitespace', () => {
    expect(normalizeTutorCode('  may 123 ')).toBe('MAY123');
  });
  it('extracts the name prefix', () => {
    expect(tutorCodePrefix('LATIFA042')).toBe('LATIFA');
    expect(tutorCodePrefix('nope')).toBeNull();
  });
  it('derives prefix from the first name', () => {
    expect(prefixFromName('May')).toBe('MAY');
    expect(prefixFromName('Latifa binti Hassan')).toBe('LATIFA');
    expect(prefixFromName("Nur'ain Aziz")).toBe('NURAIN');
  });
  it('builds codes with exactly three digits', () => {
    expect(buildTutorCode('MAY', () => 7)).toBe('MAY007');
    expect(buildTutorCode('AMIR', () => 999)).toBe('AMIR999');
    expect(() => buildTutorCode('may', () => 1)).toThrow();
  });
});

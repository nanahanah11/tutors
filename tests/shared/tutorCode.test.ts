import { describe, expect, it } from 'vitest';
import {
  PASSWORD_ALPHABET,
  PASSWORD_LENGTH,
  generatePassword,
  isValidPasswordFormat,
  isValidUsername,
  normalizeUsername,
  usernameFromName,
} from '../../src/shared/tutorCode';

describe('tutor username', () => {
  it.each(['MAY', 'AMIR', 'ARYA', 'LATIFA'])('accepts %s', (u) => expect(isValidUsername(u)).toBe(true));
  it.each(['M', 'may', 'MAY1', 'MAY 1', 'MAY-1', ''])('rejects %s', (u) => expect(isValidUsername(u)).toBe(false));
  it('is case-insensitive and ignores spaces', () => {
    expect(normalizeUsername('  may ')).toBe('MAY');
  });
  it('derives from the first name', () => {
    expect(usernameFromName('May')).toBe('MAY');
    expect(usernameFromName('Latifa binti Hassan')).toBe('LATIFA');
    expect(usernameFromName("Nur'ain Aziz")).toBe('NURAIN');
  });
});

describe('tutor password generation', () => {
  // Deterministic pseudo-random source for testing; production uses crypto.randomInt.
  const seeded = (seed: number) => () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
  const rng = (seed: number) => {
    const next = seeded(seed);
    return (max: number) => next() % max;
  };

  it('is exactly 8 characters from the unambiguous alphabet', () => {
    for (let i = 1; i <= 200; i++) {
      const p = generatePassword(rng(i));
      expect(p).toHaveLength(PASSWORD_LENGTH);
      expect(PASSWORD_LENGTH).toBe(8);
      for (const ch of p) expect(PASSWORD_ALPHABET).toContain(ch);
    }
  });
  it('always contains a lower-case letter, an upper-case letter and a digit', () => {
    for (let i = 1; i <= 200; i++) {
      const p = generatePassword(rng(i));
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
    }
  });
  it('avoids look-alike characters', () => {
    expect(PASSWORD_ALPHABET).not.toMatch(/[0O1lI]/);
  });
  it('validates the format', () => {
    expect(isValidPasswordFormat('Abcd2345')).toBe(true);
    expect(isValidPasswordFormat('Abcd234')).toBe(false);
    expect(isValidPasswordFormat('Abcd 345')).toBe(false);
  });
});

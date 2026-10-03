/**
 * Tutor access-code rules (PRD FR-AUTH-003, FR-TUT-001, §14.2).
 * Format: <UPPERCASE_FIRST_NAME><exactly 3 random digits>, e.g. MAY123.
 */
export const TUTOR_CODE_PATTERN = /^([A-Z]{2,20})(\d{3})$/;
export const TUTOR_PREFIX_PATTERN = /^[A-Z]{2,20}$/;

/** Uppercases and strips whitespace so " may 123 " is accepted as MAY123. */
export function normalizeTutorCode(input: string): string {
  return (input ?? '').replace(/\s+/g, '').toUpperCase();
}

export function isValidTutorCodeFormat(code: string): boolean {
  return TUTOR_CODE_PATTERN.test(code);
}

/** Returns the name prefix of a well-formed code, or null. */
export function tutorCodePrefix(code: string): string | null {
  const m = TUTOR_CODE_PATTERN.exec(code);
  return m ? m[1] : null;
}

/** Derives the code prefix from a tutor's name: first name, letters only, uppercase. */
export function prefixFromName(fullName: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  return first
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 20);
}

/**
 * Builds a code from a prefix and a random integer source.
 * `randomInt(max)` must return a uniformly random integer in [0, max) from a CSPRNG.
 */
export function buildTutorCode(prefix: string, randomInt: (max: number) => number): string {
  if (!TUTOR_PREFIX_PATTERN.test(prefix)) {
    throw new Error(`Invalid tutor code prefix "${prefix}" – use 2-20 uppercase letters`);
  }
  const digits = String(randomInt(1000)).padStart(3, '0');
  return `${prefix}${digits}`;
}

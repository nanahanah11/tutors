/** Malaysia-time helpers (PRD §6 assumption 10, FR-SAVE-010). */
export const MY_TIME_ZONE = 'Asia/Kuala_Lumpur';

const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: MY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Current calendar date in Malaysia as YYYY-MM-DD. */
export function malaysiaToday(now: Date = new Date()): string {
  return ymd.format(now);
}

/** Current Malaysia time as HH:MM (24h). */
export function malaysiaTimeHHMM(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: MY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

/** Same-day edit window: a tutor may edit only while today (MYT) equals the class date. */
export function isTutorEditable(classDate: string, now: Date = new Date()): boolean {
  return classDate === malaysiaToday(now);
}

/** Milliseconds until the edit window for `classDate` closes (00:00 MYT next day); 0 if closed. */
export function msUntilEditWindowCloses(classDate: string, now: Date = new Date()): number {
  if (!isTutorEditable(classDate, now)) return 0;
  // Malaysia has no DST: UTC+08:00 all year.
  const closesAt = Date.parse(`${classDate}T00:00:00+08:00`) + 24 * 60 * 60 * 1000;
  return Math.max(0, closesAt - now.getTime());
}

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** 2026-10-03 -> 03/10/2026 (Malaysian DD/MM/YYYY). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** 10:45 / 10:45:00 -> 10:45 AM */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${suffix}`;
}

/** ISO timestamp -> "03/10/2026, 10:47 AM" in Malaysia time. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: MY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

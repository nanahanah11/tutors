/** Mandatory roster notice (FR-STU-011, FR-ATT-013, AC-011). */
export const ROSTER_NOTICE = 'Any changes related to the student list, please let Ms Aida know ASAP.';

export function RosterNotice() {
  return (
    <div className="alert alert-warn notice-roster" role="note">
      <span aria-hidden="true">⚠️ </span>
      {ROSTER_NOTICE}
    </div>
  );
}

/** APSpace manual-entry workflow labels (PRD §19). */
export type ApspaceStatus = 'pending' | 'keyed_in';

export const APSPACE_LABELS: Record<ApspaceStatus, string> = {
  pending: 'Pending APSpace Entry',
  keyed_in: 'Keyed into APSpace',
};

export function apspaceLabel(status: string | null | undefined): string {
  return status === 'keyed_in' ? APSPACE_LABELS.keyed_in : APSPACE_LABELS.pending;
}

/** Only pending -> keyed_in (and lecturer revert keyed_in -> pending) are meaningful transitions. */
export function nextApspaceStatus(current: ApspaceStatus): ApspaceStatus {
  return current === 'pending' ? 'keyed_in' : 'pending';
}

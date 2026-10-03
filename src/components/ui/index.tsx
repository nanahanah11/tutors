import { useEffect, useRef, type ReactNode } from 'react';
import { apspaceLabel } from '../../shared/apspace';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Alert({
  kind = 'info',
  title,
  children,
  action,
}: {
  kind?: 'info' | 'warn' | 'error' | 'ok';
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const cls = kind === 'info' ? 'alert' : `alert alert-${kind}`;
  return (
    <div className={cls} role={kind === 'error' ? 'alert' : 'status'}>
      {title && <strong>{title}</strong>}
      {children}
      {action && <div className="row" style={{ marginTop: '0.5rem' }}>{action}</div>}
    </div>
  );
}

/** Status is conveyed by text + icon, never colour alone (§21.6). */
export function ApspaceBadge({ status }: { status: string }) {
  const keyed = status === 'keyed_in';
  return (
    <span className={`badge ${keyed ? 'badge-keyed' : 'badge-pending'}`}>
      <span aria-hidden="true">{keyed ? '✔' : '⏳'}</span>
      {apspaceLabel(status)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (status === 'present')
    return (
      <span className="badge badge-present">
        <span aria-hidden="true">✔</span> Present
      </span>
    );
  if (status === 'absent')
    return (
      <span className="badge badge-absent">
        <span aria-hidden="true">✘</span> Absent
      </span>
    );
  return <span className="badge badge-neutral">Unmarked</span>;
}

export function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'present' | 'absent' | 'unmarked' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" aria-live="polite">
        {value}
      </div>
    </div>
  );
}

/** Accessible modal built on the native <dialog> element. */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <div className="modal-body">
            <h2 id="modal-title">{title}</h2>
            {children}
          </div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

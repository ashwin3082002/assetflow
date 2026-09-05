import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ErrorAlert } from './ErrorAlert';

interface Props {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger' | 'success' | 'warning';
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

/** Minimal Bootstrap modal without the Bootstrap JS bundle. Handles pending state and errors inline. */
export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', confirmVariant = 'primary', onConfirm, onCancel }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Latest onCancel without re-running the effect (callers rarely memoize it); focus must move only when the dialog opens.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  // Keyboard support without the Bootstrap JS bundle: focus lands in the dialog and Escape cancels.
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending(false);
        setError(null);
        onCancelRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const reset = () => {
    setPending(false);
    setError(null);
  };

  const cancel = () => {
    reset();
    onCancel();
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      reset();
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  return (
    <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" style={{ background: 'rgba(0,0,0,.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="confirm-dialog-title">
              {title}
            </h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={cancel} disabled={pending} />
          </div>
          <div className="modal-body">
            <ErrorAlert error={error} />
            {body}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={cancel} disabled={pending}>
              Cancel
            </button>
            <button ref={confirmRef} type="button" className={`btn btn-${confirmVariant}`} onClick={confirm} disabled={pending}>
              {pending ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { isApiError } from '../../api/client';

interface Props {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong';
}

/** Server-side field errors (`details[{ path, message }]`) so validation problems are readable even where a form does not map them to inputs. */
function errorDetails(error: unknown): { path: string; message: string }[] {
  if (!isApiError(error) || !Array.isArray(error.details)) return [];
  return error.details.filter((d): d is { path: string; message: string } => typeof d?.message === 'string');
}

export function ErrorAlert({ error, onRetry, className = '' }: Props) {
  if (!error) return null;
  const details = errorDetails(error);
  return (
    <div className={`alert alert-danger d-flex justify-content-between align-items-start ${className}`} role="alert">
      <div>
        <span>{errorMessage(error)}</span>
        {details.length > 0 && (
          <ul className="mb-0 mt-1 ps-3 small">
            {details.map((d, i) => (
              <li key={`${d.path}-${i}`}>
                {d.path && <span className="font-monospace">{d.path}: </span>}
                {d.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      {onRetry && (
        <button type="button" className="btn btn-sm btn-outline-danger ms-3 flex-shrink-0" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

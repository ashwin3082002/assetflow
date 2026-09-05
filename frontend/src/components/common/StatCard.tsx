import { Link } from 'react-router-dom';

interface Props {
  label: string;
  value: number | string;
  /** Optional destination; the whole card becomes a link. */
  to?: string;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' | 'dark';
  hint?: string;
}

/** Dashboard tile: big number, label, optional hint and link. */
export function StatCard({ label, value, to, variant = 'secondary', hint }: Props) {
  const body = (
    <div className={`card h-100 border-${variant}`} data-testid="stat-card">
      <div className="card-body py-3">
        <div className={`fs-2 fw-semibold lh-1 text-${variant === 'secondary' ? 'body' : variant}`}>{value}</div>
        <div className="small text-uppercase text-secondary mt-1">{label}</div>
        {hint && <div className="small text-secondary">{hint}</div>}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="text-decoration-none" aria-label={`${label}: ${value}`}>
      {body}
    </Link>
  ) : (
    body
  );
}

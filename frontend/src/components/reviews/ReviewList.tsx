import { Link } from 'react-router-dom';
import type { Review } from '../../types';
import { formatDate } from '../../utils/format';

interface Props {
  rows: Review[];
  /** Link each review to its asset (used on "My reviews"). */
  showAsset?: boolean;
}

export function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

export function ReviewList({ rows, showAsset = false }: Props) {
  return (
    <ul className="list-group list-group-flush" data-testid="review-list">
      {rows.map((r) => (
        <li key={r.id} className="list-group-item px-0">
          <div className="d-flex justify-content-between align-items-start gap-2">
            <div>
              <span className="text-warning" aria-hidden="true">
                {stars(r.rating)}
              </span>{' '}
              <span className="small">{r.rating}/5</span>
              <span className="visually-hidden">{r.rating} out of 5</span>
              {showAsset && (
                <>
                  {' · '}
                  <Link to={`/assets/${r.asset.id}`}>{r.asset.name}</Link>
                </>
              )}
            </div>
            <small className="text-secondary text-nowrap">
              {r.reviewer.fullName} · {formatDate(r.createdAt)}
            </small>
          </div>
          {r.comment && (
            <p className="mb-0 mt-1" style={{ whiteSpace: 'pre-wrap' }}>
              {r.comment}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

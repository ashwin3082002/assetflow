import { Link, useSearchParams } from 'react-router-dom';
import { listRequests } from '../../api/requests.api';
import { listReviews } from '../../api/reviews.api';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Loading } from '../../components/common/Loading';
import { Pagination } from '../../components/common/Pagination';
import { RequestTable } from '../../components/requests/RequestTable';
import { ReviewList } from '../../components/reviews/ReviewList';
import { useApi } from '../../hooks/useApi';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { RequestStatus, type RequestSummary } from '../../types';
import { humanize } from '../../utils/format';

const DEFAULT_FILTERS = { status: '', sort: 'createdAt', order: 'desc' };

/** Employee's own requests, with a "My reviews" tab; the API scopes both lists to the caller. */
export function MyRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'reviews' ? 'reviews' : 'requests';

  return (
    <div>
      <ul className="nav nav-tabs mb-3" role="tablist" aria-label="My requests views">
        <li className="nav-item">
          <button type="button" role="tab" aria-selected={view === 'requests'} className={`nav-link ${view === 'requests' ? 'active' : ''}`} onClick={() => setSearchParams(new URLSearchParams())}>
            Requests
          </button>
        </li>
        <li className="nav-item">
          <button type="button" role="tab" aria-selected={view === 'reviews'} className={`nav-link ${view === 'reviews' ? 'active' : ''}`} onClick={() => setSearchParams(new URLSearchParams({ view: 'reviews' }))}>
            My reviews
          </button>
        </li>
      </ul>
      {view === 'reviews' ? <MyReviews /> : <MyRequests />}
    </div>
  );
}

function MyRequests() {
  const query = usePaginatedQuery<RequestSummary>(listRequests, DEFAULT_FILTERS);

  let content;
  if (query.isLoading) content = <Loading label="Loading your requests…" />;
  else if (query.error) content = <ErrorAlert error={query.error} onRetry={query.reload} />;
  else if (!query.data || query.data.length === 0)
    content = (
      <EmptyState
        title="No requests found"
        message={query.hasActiveFilters ? 'No requests match this status.' : 'Browse the catalogue and request an available asset.'}
        action={
          query.hasActiveFilters ? (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={query.clearFilters}>
              Clear filters
            </button>
          ) : (
            <Link to="/assets?availableOnly=true" className="btn btn-primary btn-sm">
              Browse assets
            </Link>
          )
        }
      />
    );
  else
    content = (
      <>
        <RequestTable rows={query.data} linkBase="/employee/requests" />
        {query.meta && <Pagination meta={query.meta} onPageChange={query.setPage} />}
      </>
    );

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">My requests</h1>
          {query.meta && !query.isLoading && <small className="text-secondary">{query.meta.total} request(s)</small>}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-end">
          <div>
            <label htmlFor="f-status" className="form-label small mb-1">
              Status
            </label>
            <select id="f-status" className="form-select form-select-sm" value={query.filters.status} onChange={(e) => query.setFilter('status', e.target.value)}>
              <option value="">All</option>
              {Object.values(RequestStatus).map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-sort" className="form-label small mb-1">
              Sort by
            </label>
            <select id="f-sort" className="form-select form-select-sm" value={query.filters.sort} onChange={(e) => query.setFilter('sort', e.target.value)}>
              <option value="createdAt">Requested date</option>
              <option value="expectedReturnDate">Return date</option>
              <option value="status">Status</option>
            </select>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => query.setFilter('order', query.filters.order === 'asc' ? 'desc' : 'asc')} aria-label={query.filters.order === 'asc' ? 'Sort descending' : 'Sort ascending'} title="Toggle sort order">
            {query.filters.order === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
      {content}
    </div>
  );
}

function MyReviews() {
  const reviews = useApi(() => listReviews({ limit: '100', sort: 'createdAt', order: 'desc' }), []);

  let content;
  if (reviews.isLoading) content = <Loading label="Loading your reviews…" />;
  else if (reviews.error) content = <ErrorAlert error={reviews.error} onRetry={reviews.reload} />;
  else if (!reviews.data || reviews.data.data.length === 0)
    content = (
      <EmptyState
        title="No reviews yet"
        message="Once a loan is completed you can rate the asset from the request page."
        icon="⭐"
        action={
          <Link to="/employee/requests?status=COMPLETED" className="btn btn-outline-primary btn-sm">
            Completed requests
          </Link>
        }
      />
    );
  else content = <ReviewList rows={reviews.data.data} showAsset />;

  return (
    <div>
      <div className="mb-3">
        <h1 className="h3 mb-0">My reviews</h1>
        {reviews.data && !reviews.isLoading && <small className="text-secondary">{reviews.data.meta.total} review(s)</small>}
      </div>
      {content}
    </div>
  );
}

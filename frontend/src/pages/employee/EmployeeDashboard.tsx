import { Link } from 'react-router-dom';
import { getEmployeeDashboard } from '../../api/dashboard.api';
import { useAuth } from '../../auth/useAuth';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Loading } from '../../components/common/Loading';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { RequestTable } from '../../components/requests/RequestTable';
import { useApi } from '../../hooks/useApi';
import { RequestStatus } from '../../types';
import { formatDate } from '../../utils/format';

/** Employee landing page: holdings, open requests, loans to review, recent changes (api-design §10). */
export function EmployeeDashboard() {
  const { user } = useAuth();
  const dash = useApi(getEmployeeDashboard, []);

  if (dash.isLoading) return <Loading label="Loading dashboard…" />;
  if (dash.error || !dash.data) return <ErrorAlert error={dash.error ?? 'Dashboard unavailable'} onRetry={dash.reload} />;
  const d = dash.data;
  const overdue = d.activeAssets.filter((r) => r.isOverdue).length;

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">My dashboard</h1>
          <small className="text-secondary">Welcome, {user?.fullName}.</small>
        </div>
        <div className="d-flex gap-2">
          <Link to="/assets?availableOnly=true" className="btn btn-sm btn-primary">
            Browse available assets
          </Link>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={dash.reload}>
            Refresh
          </button>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Assets on loan" value={d.counts.activeAssets} to="/employee/assets" variant={overdue > 0 ? 'danger' : 'primary'} hint={overdue > 0 ? `${overdue} overdue` : undefined} />
        </div>
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Pending approval" value={d.counts.pendingRequests} to="/employee/requests?status=PENDING" variant="warning" />
        </div>
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Approved, awaiting pickup" value={d.counts.approvedRequests} to="/employee/requests?status=APPROVED" variant="info" />
        </div>
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Reviews written" value={d.counts.reviewsSubmitted} to="/employee/requests?view=reviews" variant="success" />
        </div>
        <div className="col-6 col-md-4 col-xl">
          <StatCard label="Available to request" value={d.counts.availableAssets} to="/assets?availableOnly=true" variant="secondary" />
        </div>
      </div>

      {d.pendingReviews.length > 0 && (
        <div className="alert alert-info" role="note" data-testid="pending-reviews">
          <strong>How did it go?</strong> You have {d.pendingReviews.length} completed loan{d.pendingReviews.length === 1 ? '' : 's'} waiting for a review.
          <ul className="mb-0 mt-1">
            {d.pendingReviews.map((r) => (
              <li key={r.id}>
                <Link to={`/employee/requests/${r.id}`}>Review {r.asset.name}</Link> <span className="text-secondary small">returned {formatDate(r.expectedReturnDate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-xl-8">
          <div className="card mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 mb-0">Assets on loan</h2>
                <Link to="/employee/assets" className="small">
                  My assets
                </Link>
              </div>
              {d.activeAssets.length > 0 ? (
                <RequestTable rows={d.activeAssets} linkBase="/employee/requests" />
              ) : (
                <p className="text-secondary small mb-0">
                  You are not holding any assets. <Link to="/assets?availableOnly=true">Browse what is available.</Link>
                </p>
              )}
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 mb-0">Open requests</h2>
                <Link to="/employee/requests" className="small">
                  All my requests
                </Link>
              </div>
              {d.pendingRequests.length > 0 ? (
                <RequestTable rows={d.pendingRequests} linkBase="/employee/requests" />
              ) : (
                <p className="text-secondary small mb-0">No requests waiting on IT Staff.</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Recent status changes</h2>
              {d.recentStatusChanges.length > 0 ? (
                <ul className="list-unstyled mb-0" data-testid="recent-changes">
                  {d.recentStatusChanges.map((r) => (
                    <li key={r.id} className="mb-2">
                      <Link to={`/employee/requests/${r.id}`} className="fw-semibold text-decoration-none">
                        {r.asset.name}
                      </Link>{' '}
                      <StatusBadge value={r.status} />
                      {r.status === RequestStatus.COMPLETED && <span className="visually-hidden"> completed</span>}
                      <div className="small text-secondary">
                        {formatDate(r.requestedFrom)} → {formatDate(r.expectedReturnDate)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-secondary small mb-0">Nothing yet. Your request activity will show up here.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

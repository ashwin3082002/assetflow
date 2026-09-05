import { Link } from 'react-router-dom';
import { getAdminDashboard } from '../../api/dashboard.api';
import { useAuth } from '../../auth/useAuth';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Loading } from '../../components/common/Loading';
import { RatingStars } from '../../components/common/RatingStars';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { MaintenanceTable } from '../../components/maintenance/MaintenanceTable';
import { RequestTable } from '../../components/requests/RequestTable';
import { useApi } from '../../hooks/useApi';
import { AssetStatus, UserRole } from '../../types';
import { formatCost } from '../../utils/format';
import { ROLE_LABELS } from '../../utils/roles';

/** System-wide overview for admins: totals, breakdowns, recent activity, top rated (api-design §10). */
export function AdminDashboard() {
  const { user } = useAuth();
  const dash = useApi(getAdminDashboard, []);

  if (dash.isLoading) return <Loading label="Loading dashboard…" />;
  if (dash.error || !dash.data) return <ErrorAlert error={dash.error ?? 'Dashboard unavailable'} onRetry={dash.reload} />;
  const d = dash.data;

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">Admin dashboard</h1>
          <small className="text-secondary">Welcome, {user?.fullName}. System-wide view; operations live under Operations.</small>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link to="/admin/users" className="btn btn-sm btn-outline-primary">
            Manage users
          </Link>
          <Link to="/admin/categories" className="btn btn-sm btn-outline-primary">
            Categories
          </Link>
          <Link to="/staff" className="btn btn-sm btn-primary">
            Operations
          </Link>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={dash.reload}>
            Refresh
          </button>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Users" value={d.users.total} to="/admin/users" variant="dark" hint={`${d.users.inactive} inactive`} />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Assets" value={d.assets.total} to="/assets" variant="primary" hint={`${d.assets.byStatus.AVAILABLE} available`} />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Pending requests" value={d.requests.pending} to="/staff/requests?status=PENDING" variant="warning" />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Overdue loans" value={d.requests.overdue} to="/staff/requests?status=&overdue=true" variant={d.requests.overdue > 0 ? 'danger' : 'secondary'} />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Open maintenance" value={d.maintenance.open} to="/staff/maintenance" variant="warning" />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Maintenance cost, 30 days" value={formatCost(d.maintenance.totalCostLast30Days)} variant="secondary" hint={`${d.maintenance.completedLast30Days} completed`} />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-xl-4">
          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Users by role</h2>
              <ul className="list-group list-group-flush" data-testid="users-by-role">
                {Object.values(UserRole).map((r) => (
                  <li key={r} className="list-group-item d-flex justify-content-between align-items-center px-0 py-1">
                    <Link to={`/admin/users?role=${r}`} className="text-decoration-none">
                      {ROLE_LABELS[r]}
                    </Link>
                    <span className="fw-semibold">{d.users.byRole[r]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Assets by status</h2>
              <ul className="list-group list-group-flush" data-testid="assets-by-status">
                {Object.values(AssetStatus).map((s) => (
                  <li key={s} className="list-group-item d-flex justify-content-between align-items-center px-0 py-1">
                    <Link to={`/assets?status=${s}`} className="text-decoration-none">
                      <StatusBadge value={s} />
                    </Link>
                    <span className="fw-semibold">{d.assets.byStatus[s]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Requests</h2>
              <dl className="row mb-0 small">
                <dt className="col-8 fw-normal">Approved, awaiting allocation</dt>
                <dd className="col-4 text-end fw-semibold">{d.requests.approved}</dd>
                <dt className="col-8 fw-normal">On loan</dt>
                <dd className="col-4 text-end fw-semibold">{d.requests.allocated}</dd>
                <dt className="col-8 fw-normal">Returns to confirm</dt>
                <dd className="col-4 text-end fw-semibold">{d.requests.returnPending}</dd>
                <dt className="col-8 fw-normal">Completed in the last 30 days</dt>
                <dd className="col-4 text-end fw-semibold mb-0">{d.requests.completedLast30Days}</dd>
              </dl>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Top rated assets</h2>
              {d.topRatedAssets.length > 0 ? (
                <ol className="mb-0 ps-3" data-testid="top-rated">
                  {d.topRatedAssets.map((a) => (
                    <li key={a.assetId} className="mb-1">
                      <Link to={`/assets/${a.assetId}`}>{a.name}</Link>
                      <div>
                        <RatingStars value={a.avgRating} count={a.reviewCount} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-secondary small mb-0">No reviews yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-8">
          <div className="card mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 mb-0">Assets by category</h2>
                <Link to="/admin/categories" className="small">
                  Manage categories
                </Link>
              </div>
              {d.assetsByCategory.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0" data-testid="assets-by-category">
                    <thead>
                      <tr>
                        <th scope="col">Category</th>
                        <th scope="col" className="text-end">
                          Units
                        </th>
                        <th scope="col" className="text-end">
                          Available
                        </th>
                        <th scope="col" style={{ width: '40%' }}>
                          <span className="visually-hidden">Availability</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.assetsByCategory.map((c) => {
                        const pct = c.total === 0 ? 0 : Math.round((c.available / c.total) * 100);
                        return (
                          <tr key={c.categoryId}>
                            <td>
                              <Link to={`/assets?categoryId=${c.categoryId}`}>{c.name}</Link>
                            </td>
                            <td className="text-end">{c.total}</td>
                            <td className="text-end">{c.available}</td>
                            <td>
                              <div className="progress" style={{ height: 8 }} role="progressbar" aria-label={`${c.name}: ${pct}% available`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                                <div className="progress-bar bg-success" style={{ width: `${pct}%` }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-secondary small mb-0">No categories yet.</p>
              )}
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 mb-0">Recent requests</h2>
                <Link to="/staff/requests?status=" className="small">
                  All requests
                </Link>
              </div>
              {d.recentRequests.length > 0 ? <RequestTable rows={d.recentRequests} linkBase="/staff/requests" showRequester /> : <p className="text-secondary small mb-0">No requests yet.</p>}
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 mb-0">Recent maintenance</h2>
                <Link to="/staff/maintenance?status=" className="small">
                  All maintenance
                </Link>
              </div>
              {d.recentMaintenance.length > 0 ? <MaintenanceTable rows={d.recentMaintenance} /> : <p className="text-secondary small mb-0">No maintenance records yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { getStaffDashboard } from '../../api/dashboard.api';
import { useAuth } from '../../auth/useAuth';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Loading } from '../../components/common/Loading';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/common/StatusBadge';
import { MaintenanceTable } from '../../components/maintenance/MaintenanceTable';
import { RequestTable } from '../../components/requests/RequestTable';
import { useApi } from '../../hooks/useApi';
import { AssetStatus, type RequestSummary } from '../../types';
import { formatDate, humanize } from '../../utils/format';
import { todayISO } from '../../utils/dates';

function Queue({ title, rows, count, to, empty }: { title: string; rows: RequestSummary[]; count: number; to: string; empty: string }) {
  return (
    <div className="card mb-3">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h2 className="h6 mb-0">
            {title} <span className="badge bg-secondary ms-1">{count}</span>
          </h2>
          <Link to={to} className="small">
            Open queue
          </Link>
        </div>
        {rows.length > 0 ? (
          <>
            <RequestTable rows={rows} linkBase="/staff/requests" showRequester />
            {count > rows.length && (
              <Link to={to} className="small">
                View all {count}
              </Link>
            )}
          </>
        ) : (
          <p className="text-secondary small mb-0">{empty}</p>
        )}
      </div>
    </div>
  );
}

/** Operations landing page: queues with links to detail pages, maintenance, inventory summary (api-design §10). */
export function StaffDashboard() {
  const { user } = useAuth();
  const dash = useApi(getStaffDashboard, []);

  if (dash.isLoading) return <Loading label="Loading dashboard…" />;
  if (dash.error || !dash.data) return <ErrorAlert error={dash.error ?? 'Dashboard unavailable'} onRetry={dash.reload} />;
  const d = dash.data;

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">IT Staff dashboard</h1>
          <small className="text-secondary">Welcome, {user?.fullName}. Here is what needs attention.</small>
        </div>
        <div className="d-flex gap-2">
          <Link to="/assets/new" className="btn btn-sm btn-primary">
            Add asset
          </Link>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={dash.reload}>
            Refresh
          </button>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Pending approval" value={d.counts.pending} to="/staff/requests?status=PENDING" variant="warning" />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Awaiting allocation" value={d.counts.awaitingAllocation} to="/staff/requests?status=APPROVED" variant="info" />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Returns to confirm" value={d.counts.returnPending} to="/staff/requests?status=RETURN_PENDING" variant="primary" />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Overdue" value={d.counts.overdue} to="/staff/requests?status=&overdue=true" variant={d.counts.overdue > 0 ? 'danger' : 'secondary'} />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Open maintenance" value={d.counts.openMaintenance} to="/staff/maintenance" variant="warning" />
        </div>
        <div className="col-6 col-md-4 col-xl-2">
          <StatCard label="Needs record" value={d.counts.needsMaintenanceRecord} variant={d.counts.needsMaintenanceRecord > 0 ? 'danger' : 'secondary'} hint="damaged returns" />
        </div>
      </div>

      {d.needsMaintenanceRecord.length > 0 && (
        <div className="alert alert-warning" role="note" data-testid="needs-record">
          <strong>Damaged returns without a maintenance record.</strong> Open a record so the repair is tracked and the unit can come back into stock.
          <ul className="mb-0 mt-1">
            {d.needsMaintenanceRecord.map((a) => (
              <li key={a.id}>
                <Link to={`/assets/${a.id}`}>{a.name}</Link> <span className="font-monospace small">{a.serialNumber}</span> · <StatusBadge value={a.condition} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row g-3">
        <div className="col-12 col-xl-8">
          <Queue title="Pending approval" rows={d.pendingRequests} count={d.counts.pending} to="/staff/requests?status=PENDING" empty="No requests waiting for a decision." />
          <Queue title="Approved, awaiting allocation" rows={d.awaitingAllocation} count={d.counts.awaitingAllocation} to="/staff/requests?status=APPROVED" empty="Nothing reserved for hand-over." />
          <Queue title="Returns to confirm" rows={d.returnPending} count={d.counts.returnPending} to="/staff/requests?status=RETURN_PENDING" empty="No returns waiting for confirmation." />
          <Queue title="Overdue loans" rows={d.overdue} count={d.counts.overdue} to="/staff/requests?status=&overdue=true" empty="Nothing is overdue. Nice." />

          <div className="card mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h2 className="h6 mb-0">
                  Open maintenance <span className="badge bg-secondary ms-1">{d.counts.openMaintenance}</span>
                </h2>
                <Link to="/staff/maintenance" className="small">
                  All maintenance
                </Link>
              </div>
              {d.openMaintenance.length > 0 ? <MaintenanceTable rows={d.openMaintenance} /> : <p className="text-secondary small mb-0">No unit is under maintenance.</p>}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-4">
          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Inventory</h2>
              <ul className="list-group list-group-flush" data-testid="inventory">
                {Object.values(AssetStatus).map((s) => (
                  <li key={s} className="list-group-item d-flex justify-content-between align-items-center px-0 py-1">
                    <Link to={`/assets?status=${s}`} className="text-decoration-none">
                      <StatusBadge value={s} />
                    </Link>
                    <span className="fw-semibold">{d.inventory.byStatus[s]}</span>
                  </li>
                ))}
                <li className="list-group-item d-flex justify-content-between align-items-center px-0 py-1">
                  <span>Total units</span>
                  <span className="fw-semibold">{d.inventory.total}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Recently added</h2>
              {d.recentlyAdded.length > 0 ? (
                <ul className="list-unstyled mb-0">
                  {d.recentlyAdded.map((a) => (
                    <li key={a.id} className="mb-2">
                      <Link to={`/assets/${a.id}`} className="fw-semibold text-decoration-none">
                        {a.name}
                      </Link>
                      <div className="small text-secondary">
                        {a.category.name} · {a.managedBy.fullName} · <StatusBadge value={a.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-secondary small mb-0">
                  No assets yet. <Link to="/assets/new">Add the first one.</Link>
                </p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-body small text-secondary">
              Overdue means a loan past its expected return date on {formatDate(todayISO())}. Units in {humanize(AssetStatus.UNDER_MAINTENANCE).toLowerCase()} cannot be requested until their record is completed.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

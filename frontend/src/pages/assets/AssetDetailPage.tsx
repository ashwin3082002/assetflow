import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteAsset, deleteAssetImage, getAsset, listAssetRequests, retireAsset, uploadAssetImage } from '../../api/assets.api';
import { absoluteUrl } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { ImageUpload } from '../../components/common/ImageUpload';
import { Loading } from '../../components/common/Loading';
import { RatingStars } from '../../components/common/RatingStars';
import { StatusBadge } from '../../components/common/StatusBadge';
import { listAssetReviews } from '../../api/reviews.api';
import { MaintenanceForm } from '../../components/maintenance/MaintenanceForm';
import { RequestForm } from '../../components/requests/RequestForm';
import { RequestTable } from '../../components/requests/RequestTable';
import { ReviewList } from '../../components/reviews/ReviewList';
import { useApi } from '../../hooks/useApi';
import { AssetStatus, MaintenanceStatus, UserRole } from '../../types';
import { formatCost, formatDate, formatDateTime, humanize } from '../../utils/format';
import { isStaff } from '../../utils/roles';

type Dialog = 'retire' | 'delete' | null;
type Panel = 'request' | 'maintenance' | null;

export function AssetDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const staff = !!user && isStaff(user.role);
  const asset = useApi(() => getAsset(id), [id]);
  const history = useApi(() => (staff ? listAssetRequests(id, { limit: '5' }) : Promise.resolve(null)), [staff, id]);
  const reviews = useApi(() => listAssetReviews(id, { limit: '5' }), [id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (asset.isLoading) return <Loading label="Loading asset…" />;
  if (asset.error || !asset.data) return <ErrorAlert error={asset.error ?? 'Asset not found'} onRetry={asset.reload} />;
  const a = asset.data;
  const retired = a.status === AssetStatus.RETIRED;
  const showRequestForm = panel === 'request';
  const showMaintenanceForm = panel === 'maintenance';
  // Maintenance can be opened on an AVAILABLE unit, or on one left UNDER_MAINTENANCE by a damaged return (no OPEN record yet).
  const hasOpenRecord = (a.recentMaintenance ?? []).some((m) => m.status === MaintenanceStatus.OPEN);
  const canOpenMaintenance = a.status === AssetStatus.AVAILABLE || (a.status === AssetStatus.UNDER_MAINTENANCE && !hasOpenRecord);
  const needsRecord = a.status === AssetStatus.UNDER_MAINTENANCE && !hasOpenRecord;

  const retire = async () => {
    await retireAsset(a.id);
    setDialog(null);
    setNotice('Asset retired.');
    asset.reload();
  };

  const remove = async () => {
    await deleteAsset(a.id);
    navigate('/assets', { replace: true });
  };

  return (
    <div>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item">
            <Link to="/assets">Assets</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {a.name}
          </li>
        </ol>
      </nav>

      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">
            {a.name} <StatusBadge value={a.status} className="align-middle fs-6" />
          </h1>
          <div className="text-secondary font-monospace">{a.serialNumber}</div>
        </div>

        <div className="d-flex flex-wrap gap-2" data-testid="asset-actions">
          {staff ? (
            <>
              <Link to={`/assets/${a.id}/edit`} className={`btn btn-outline-primary ${retired ? 'disabled' : ''}`} aria-disabled={retired}>
                Edit
              </Link>
              <button
                type="button"
                className="btn btn-outline-warning"
                disabled={!canOpenMaintenance}
                title={canOpenMaintenance ? undefined : hasOpenRecord ? 'This unit already has an open maintenance record' : 'Maintenance can only be opened on an available unit'}
                onClick={() => setPanel((p) => (p === 'maintenance' ? null : 'maintenance'))}
                aria-expanded={showMaintenanceForm}
              >
                Open maintenance
              </button>
              <button type="button" className="btn btn-outline-warning" disabled={retired || (a.status !== AssetStatus.AVAILABLE && a.status !== AssetStatus.UNDER_MAINTENANCE) || hasOpenRecord} onClick={() => setDialog('retire')}>
                Retire
              </button>
              <button type="button" className="btn btn-outline-danger" onClick={() => setDialog('delete')}>
                Delete
              </button>
            </>
          ) : (
            user?.role === UserRole.EMPLOYEE &&
            a.status === AssetStatus.AVAILABLE && (
              <button type="button" className="btn btn-primary" onClick={() => setPanel((p) => (p === 'request' ? null : 'request'))} aria-expanded={showRequestForm}>
                Request this asset
              </button>
            )
          )}
        </div>
      </div>

      {notice && (
        <div className="alert alert-success py-2" role="status">
          {notice}
        </div>
      )}

      {staff && needsRecord && (
        <div className="alert alert-warning py-2" role="note">
          This unit came back <strong>damaged</strong> and is under maintenance without a record. Open a maintenance record to track the repair.
        </div>
      )}

      {showRequestForm && a.status === AssetStatus.AVAILABLE && (
        <RequestForm asset={a} onCancel={() => setPanel(null)} onCreated={(created) => navigate(`/employee/requests/${created.id}`)} />
      )}
      {showMaintenanceForm && canOpenMaintenance && (
        <MaintenanceForm asset={a} onCancel={() => setPanel(null)} onCreated={(created) => navigate(`/staff/maintenance/${created.id}`)} />
      )}

      <div className="row g-3">
        <div className="col-12 col-lg-4">
          {staff && !retired ? (
            <ImageUpload
              currentUrl={a.imageUrl}
              onUpload={async (file) => {
                await uploadAssetImage(a.id, file);
                asset.reload();
              }}
              onRemove={async () => {
                await deleteAssetImage(a.id);
                asset.reload();
              }}
            />
          ) : a.imageUrl ? (
            <img src={absoluteUrl(a.imageUrl)} alt={a.name} className="img-fluid rounded border" />
          ) : (
            <div className="border rounded bg-light text-secondary d-flex align-items-center justify-content-center" style={{ height: 200 }}>
              No image
            </div>
          )}
        </div>

        <div className="col-12 col-lg-8">
          <div className="card mb-3">
            <div className="card-body">
              <dl className="row mb-0">
                <dt className="col-sm-4">Category</dt>
                <dd className="col-sm-8">{a.category.name}</dd>
                <dt className="col-sm-4">Managed by</dt>
                <dd className="col-sm-8">{a.managedBy.fullName}</dd>
                <dt className="col-sm-4">Condition</dt>
                <dd className="col-sm-8">
                  <StatusBadge value={a.condition} />
                </dd>
                <dt className="col-sm-4">Rating</dt>
                <dd className="col-sm-8">
                  <RatingStars value={a.avgRating} count={a.reviewCount} />
                </dd>
                <dt className="col-sm-4">Location</dt>
                <dd className="col-sm-8">{a.location ?? '—'}</dd>
                <dt className="col-sm-4">Purchase date</dt>
                <dd className="col-sm-8">{formatDate(a.purchaseDate)}</dd>
                <dt className="col-sm-4">Max loan period</dt>
                <dd className="col-sm-8">{a.maxLoanDays ? `${a.maxLoanDays} days` : 'No limit'}</dd>
                <dt className="col-sm-4">Added</dt>
                <dd className="col-sm-8">{formatDateTime(a.createdAt)}</dd>
              </dl>
            </div>
          </div>

          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Description</h2>
              <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                {a.description}
              </p>
            </div>
          </div>

          {staff && (
            <>
              <div className="card mb-3">
                <div className="card-body">
                  <h2 className="h6">Active request</h2>
                  {a.activeRequest ? (
                    <div>
                      <StatusBadge value={a.activeRequest.status} />{' '}
                      <span className="fw-semibold">{a.activeRequest.requester.fullName}</span>
                      <Link to={`/staff/requests/${a.activeRequest.id}`} className="ms-2 small">
                        Open request
                      </Link>
                      {a.activeRequest.requester.department && <span className="text-secondary"> · {a.activeRequest.requester.department}</span>}
                      <div className="small text-secondary">
                        {formatDate(a.activeRequest.requestedFrom)} → {formatDate(a.activeRequest.expectedReturnDate)}
                        {a.activeRequest.isOverdue && <span className="badge bg-danger ms-2">Overdue</span>}
                      </div>
                      <div className="small mt-1">{a.activeRequest.purpose}</div>
                    </div>
                  ) : (
                    <p className="text-secondary small mb-0">No request currently holds this unit.</p>
                  )}
                </div>
              </div>
              <div className="card mb-3">
                <div className="card-body">
                  <h2 className="h6">Maintenance history</h2>
                  {a.recentMaintenance && a.recentMaintenance.length > 0 ? (
                    <>
                      <ul className="list-unstyled mb-2" data-testid="maintenance-history">
                        {a.recentMaintenance.map((m) => (
                          <li key={m.id} className="mb-2">
                            <StatusBadge value={m.status} />{' '}
                            <Link to={`/staff/maintenance/${m.id}`} className="fw-semibold">
                              {humanize(m.type)}
                            </Link>{' '}
                            <span className="text-secondary small">
                              · {formatDate(m.startedAt)}
                              {m.completedAt && <> → {formatDate(m.completedAt)}</>}
                              {m.cost !== null && <> · {formatCost(m.cost)}</>}
                              {m.resultingCondition && <> · {humanize(m.resultingCondition)}</>}
                            </span>
                            <div className="small text-secondary text-truncate">{m.description}</div>
                          </li>
                        ))}
                      </ul>
                      <Link to={`/staff/maintenance?status=&search=${encodeURIComponent(a.serialNumber)}`} className="small">
                        View all maintenance for this unit
                      </Link>
                    </>
                  ) : (
                    <p className="text-secondary small mb-0">No maintenance records for this unit.</p>
                  )}
                </div>
              </div>
              <div className="card mb-3">
                <div className="card-body">
                  <h2 className="h6">Request history</h2>
                  {history.isLoading ? (
                    <Loading label="Loading history…" />
                  ) : history.error ? (
                    <ErrorAlert error={history.error} onRetry={history.reload} className="mb-0" />
                  ) : history.data && history.data.data.length > 0 ? (
                    <>
                      <RequestTable rows={history.data.data} linkBase="/staff/requests" showRequester />
                      {history.data.meta.total > history.data.data.length && (
                        <Link to={`/staff/requests?status=&search=${encodeURIComponent(a.serialNumber)}`} className="small">
                          View all {history.data.meta.total} requests
                        </Link>
                      )}
                    </>
                  ) : (
                    <p className="text-secondary small mb-0">This unit has never been requested.</p>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Reviews</h2>
              {reviews.isLoading ? (
                <Loading label="Loading reviews…" />
              ) : reviews.error ? (
                <ErrorAlert error={reviews.error} onRetry={reviews.reload} className="mb-0" />
              ) : reviews.data && reviews.data.data.length > 0 ? (
                <>
                  <div className="mb-2">
                    <RatingStars value={reviews.data.summary.avgRating} count={reviews.data.summary.reviewCount} />
                  </div>
                  <ReviewList rows={reviews.data.data} />
                  {reviews.data.meta.total > reviews.data.data.length && (
                    <p className="small text-secondary mb-0 mt-2">Showing the latest {reviews.data.data.length} of {reviews.data.meta.total} reviews.</p>
                  )}
                </>
              ) : (
                <p className="text-secondary small mb-0">No reviews yet. Employees can review a loan once it is completed.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'retire'}
        title="Retire this asset?"
        body={
          <p className="mb-0">
            <strong>{a.name}</strong> ({a.serialNumber}) will be retired. This cannot be undone and the unit can no longer be requested.
          </p>
        }
        confirmLabel="Retire"
        confirmVariant="warning"
        onConfirm={retire}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete this asset?"
        body={
          <p className="mb-0">
            <strong>{a.name}</strong> ({a.serialNumber}) will be permanently deleted. Deletion is only possible when the unit has no request or maintenance history; otherwise retire it instead.
          </p>
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={remove}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

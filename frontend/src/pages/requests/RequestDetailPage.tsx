import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAsset } from '../../api/assets.api';
import { absoluteUrl } from '../../api/client';
import { allocateRequest, approveRequest, cancelRequest, completeRequest, getRequest, initiateReturn, rejectRequest } from '../../api/requests.api';
import { useAuth } from '../../auth/useAuth';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { SelectField, TextAreaField } from '../../components/common/FormField';
import { Loading } from '../../components/common/Loading';
import { StatusBadge } from '../../components/common/StatusBadge';
import { RequestTimeline } from '../../components/requests/RequestTimeline';
import { ReviewForm } from '../../components/reviews/ReviewForm';
import { useApi } from '../../hooks/useApi';
import { AssetCondition, AssetStatus, RequestStatus, type RequestDetail } from '../../types';
import { formatDate, humanize } from '../../utils/format';
import { stars } from '../../components/reviews/ReviewList';
import { isStaff } from '../../utils/roles';

type Action = 'approve' | 'reject' | 'allocate' | 'complete' | 'cancel' | 'return';

const STAFF_ACTIONS: Record<RequestStatus, Action[]> = {
  PENDING: ['approve', 'reject'],
  APPROVED: ['allocate', 'reject'],
  ALLOCATED: ['complete'],
  RETURN_PENDING: ['complete'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

const EMPLOYEE_ACTIONS: Record<RequestStatus, Action[]> = {
  PENDING: ['cancel'],
  APPROVED: ['cancel'],
  ALLOCATED: ['return'],
  RETURN_PENDING: [],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

const ACTION_LABELS: Record<Action, string> = {
  approve: 'Approve',
  reject: 'Reject',
  allocate: 'Allocate',
  complete: 'Complete return',
  cancel: 'Cancel request',
  return: 'Initiate return',
};

const ACTION_VARIANTS: Record<Action, 'primary' | 'danger' | 'success' | 'warning'> = {
  approve: 'success',
  reject: 'danger',
  allocate: 'primary',
  complete: 'success',
  cancel: 'danger',
  return: 'primary',
};

/**
 * Shared employee / staff request detail (architecture §4.2). The API enforces ownership and
 * every transition; the role only decides which buttons are rendered.
 */
export function RequestDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const staff = !!user && isStaff(user.role);
  const linkBase = staff ? '/staff/requests' : '/employee/requests';

  const req = useApi(() => getRequest(id), [id]);
  // Staff see the unit's live status so an impossible approval is explained before the 409.
  const assetId = req.data?.asset.id;
  const asset = useApi(() => (staff && assetId ? getAsset(assetId) : Promise.resolve(null)), [staff, assetId]);

  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [condition, setCondition] = useState<AssetCondition>(AssetCondition.GOOD);
  const [notes, setNotes] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  if (req.isLoading) return <Loading label="Loading request…" />;
  if (req.error || !req.data) return <ErrorAlert error={req.error ?? 'Request not found'} onRetry={req.reload} />;
  const r: RequestDetail = req.data;

  const actions = staff ? STAFF_ACTIONS[r.status] : EMPLOYEE_ACTIONS[r.status];
  const unitStatus = asset.data?.status;
  const approveBlocked = staff && r.status === RequestStatus.PENDING && unitStatus !== undefined && unitStatus !== AssetStatus.AVAILABLE;

  const closeDialog = () => {
    setAction(null);
    setReason('');
    setNotes('');
    setCondition(AssetCondition.GOOD);
  };

  const run = async () => {
    if (!action) return;
    switch (action) {
      case 'approve':
        await approveRequest(r.id);
        setNotice('Request approved. The unit is now reserved for the requester.');
        break;
      case 'reject':
        if (reason.trim().length < 3) throw new Error('Please give a reason (at least 3 characters).');
        await rejectRequest(r.id, reason.trim());
        setNotice('Request rejected.');
        break;
      case 'allocate':
        await allocateRequest(r.id);
        setNotice('Unit allocated to the requester.');
        break;
      case 'complete':
        await completeRequest(r.id, { returnCondition: condition, returnNotes: notes.trim() || null });
        setNotice(condition === AssetCondition.DAMAGED ? 'Return completed. The unit was moved to maintenance; open a maintenance record for it.' : 'Return completed. The unit is available again.');
        break;
      case 'cancel':
        await cancelRequest(r.id);
        setNotice('Request cancelled.');
        break;
      case 'return':
        await initiateReturn(r.id);
        setNotice('Return initiated. IT Staff will confirm once the unit is back.');
        break;
    }
    closeDialog();
    req.reload();
    asset.reload();
  };

  const dialogBody = () => {
    switch (action) {
      case 'approve':
        return (
          <p className="mb-0">
            Approving reserves <strong>{r.asset.name}</strong> ({r.asset.serialNumber}) for {r.requester.fullName}. Allocate it once the unit is handed over.
          </p>
        );
      case 'reject':
        return (
          <>
            {r.status === RequestStatus.APPROVED && <p className="small text-secondary">Rejecting an approved request releases the reserved unit.</p>}
            <TextAreaField id="reject-reason" label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} hint="Shown to the requester (3–500 characters)." maxLength={500} required />
          </>
        );
      case 'allocate':
        return (
          <p className="mb-0">
            Confirm that <strong>{r.asset.name}</strong> ({r.asset.serialNumber}) has been handed over to {r.requester.fullName}. Expected back on {formatDate(r.expectedReturnDate)}.
          </p>
        );
      case 'complete':
        return (
          <>
            <SelectField id="return-condition" label="Condition on return" value={condition} onChange={(e) => setCondition(e.target.value as AssetCondition)} hint={condition === AssetCondition.DAMAGED ? 'A damaged unit goes to maintenance instead of back into stock.' : 'The asset takes this condition and becomes available again.'}>
              {Object.values(AssetCondition).map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </SelectField>
            <TextAreaField id="return-notes" label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </>
        );
      case 'cancel':
        return (
          <p className="mb-0">
            Cancel your request for <strong>{r.asset.name}</strong>?{r.status === RequestStatus.APPROVED && ' The reserved unit will be released.'}
          </p>
        );
      case 'return':
        return (
          <p className="mb-0">
            Let IT Staff know you are returning <strong>{r.asset.name}</strong> ({r.asset.serialNumber}). The loan completes once they confirm the unit's condition.
          </p>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item">
            <Link to={linkBase}>{staff ? 'Requests' : 'My requests'}</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {r.asset.name}
          </li>
        </ol>
      </nav>

      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">
            Request for {r.asset.name} <StatusBadge value={r.status} className="align-middle fs-6" />
            {r.isOverdue && <span className="badge bg-danger align-middle fs-6 ms-1">Overdue</span>}
          </h1>
          <div className="text-secondary small">
            Requested {formatDate(r.createdAt)} by {r.requester.fullName}
            {r.requester.department && <> · {r.requester.department}</>}
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2" data-testid="request-actions">
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              className={`btn btn-${a === 'reject' || a === 'cancel' ? 'outline-danger' : ACTION_VARIANTS[a]}`}
              onClick={() => setAction(a)}
              disabled={a === 'approve' && approveBlocked}
              title={a === 'approve' && approveBlocked ? 'The unit is no longer available' : undefined}
            >
              {ACTION_LABELS[a]}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="alert alert-success py-2" role="status">
          {notice}
        </div>
      )}
      {staff && !!asset.error && <ErrorAlert error={asset.error} onRetry={asset.reload} className="py-2" />}
      {approveBlocked && (
        <div className="alert alert-warning py-2" role="note">
          This unit is currently <StatusBadge value={unitStatus ?? ''} />, so this request cannot be approved. Reject it, or wait until the unit is available again.
        </div>
      )}
      {!staff && r.status === RequestStatus.COMPLETED && !r.review && (
        <ReviewForm
          requestId={r.id}
          assetName={r.asset.name}
          onCreated={() => {
            setNotice('Thanks for your review. It now counts towards the asset rating.');
            req.reload();
          }}
        />
      )}

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6">Details</h2>
              <dl className="row mb-0">
                <dt className="col-sm-4">Asset</dt>
                <dd className="col-sm-8">
                  <div className="d-flex align-items-center gap-2">
                    {r.asset.imageUrl && <img src={absoluteUrl(r.asset.imageUrl)} alt="" width={40} height={40} className="rounded object-fit-cover" />}
                    <div>
                      <Link to={`/assets/${r.asset.id}`}>{r.asset.name}</Link>
                      <div className="small text-secondary font-monospace">{r.asset.serialNumber}</div>
                    </div>
                  </div>
                </dd>
                {staff && unitStatus && (
                  <>
                    <dt className="col-sm-4">Unit status</dt>
                    <dd className="col-sm-8">
                      <StatusBadge value={unitStatus} />
                    </dd>
                  </>
                )}
                <dt className="col-sm-4">Requester</dt>
                <dd className="col-sm-8">
                  {r.requester.fullName}
                  {r.requester.department && <span className="text-secondary"> · {r.requester.department}</span>}
                </dd>
                <dt className="col-sm-4">Loan period</dt>
                <dd className="col-sm-8">
                  {formatDate(r.requestedFrom)} → {formatDate(r.expectedReturnDate)}
                </dd>
                <dt className="col-sm-4">Purpose</dt>
                <dd className="col-sm-8" style={{ whiteSpace: 'pre-wrap' }}>
                  {r.purpose}
                </dd>
                {r.processedBy && (
                  <>
                    <dt className="col-sm-4">Processed by</dt>
                    <dd className="col-sm-8">{r.processedBy.fullName}</dd>
                  </>
                )}
                {r.rejectionReason && (
                  <>
                    <dt className="col-sm-4">Rejection reason</dt>
                    <dd className="col-sm-8">{r.rejectionReason}</dd>
                  </>
                )}
                {r.returnCondition && (
                  <>
                    <dt className="col-sm-4">Returned</dt>
                    <dd className="col-sm-8">
                      <StatusBadge value={r.returnCondition} />
                      {r.returnNotes && <div className="small text-secondary">{r.returnNotes}</div>}
                    </dd>
                  </>
                )}
                {r.review && (
                  <>
                    <dt className="col-sm-4">Review</dt>
                    <dd className="col-sm-8">
                      <span className="text-warning" aria-hidden="true">
                        {stars(r.review.rating)}
                      </span>{' '}
                      <span className="small">{r.review.rating}/5</span>
                      {!staff && (
                        <Link to="/employee/requests?view=reviews" className="small ms-2">
                          My reviews
                        </Link>
                      )}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-5">
          <div className="card">
            <div className="card-body">
              <h2 className="h6">Timeline</h2>
              <RequestTimeline request={r} />
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={action !== null}
        title={action ? `${ACTION_LABELS[action]}?` : ''}
        body={dialogBody()}
        confirmLabel={action ? ACTION_LABELS[action] : 'Confirm'}
        confirmVariant={action ? ACTION_VARIANTS[action] : 'primary'}
        onConfirm={run}
        onCancel={closeDialog}
      />
    </div>
  );
}

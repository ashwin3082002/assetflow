import { useState } from 'react';
import { Link } from 'react-router-dom';
import { absoluteUrl } from '../../api/client';
import { initiateReturn, listRequests } from '../../api/requests.api';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Loading } from '../../components/common/Loading';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useApi } from '../../hooks/useApi';
import { RequestStatus, type RequestSummary } from '../../types';
import { formatDate } from '../../utils/format';

/** Units the employee currently holds: requests in ALLOCATED or RETURN_PENDING. */
export function MyAssetsPage() {
  const holdings = useApi(() => listRequests({ status: `${RequestStatus.ALLOCATED},${RequestStatus.RETURN_PENDING}`, sort: 'expectedReturnDate', order: 'asc', limit: '100' }), []);
  const [returning, setReturning] = useState<RequestSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  let content;
  if (holdings.isLoading) content = <Loading label="Loading your assets…" />;
  else if (holdings.error) content = <ErrorAlert error={holdings.error} onRetry={holdings.reload} />;
  else if (!holdings.data || holdings.data.data.length === 0)
    content = (
      <EmptyState
        title="You are not holding any assets"
        message="Assets allocated to you will appear here with their return dates."
        action={
          <Link to="/assets?availableOnly=true" className="btn btn-primary btn-sm">
            Browse available assets
          </Link>
        }
      />
    );
  else
    content = (
      <div className="row g-3">
        {holdings.data.data.map((r) => (
          <div className="col-12 col-md-6 col-xl-4" key={r.id}>
            <div className={`card h-100 ${r.isOverdue ? 'border-danger' : ''}`} data-testid="holding-card">
              <div className="card-body d-flex gap-3">
                {r.asset.imageUrl ? (
                  <img src={absoluteUrl(r.asset.imageUrl)} alt="" width={64} height={64} className="rounded object-fit-cover flex-shrink-0" />
                ) : (
                  <div className="bg-light rounded d-flex align-items-center justify-content-center text-secondary flex-shrink-0" style={{ width: 64, height: 64 }} aria-hidden="true">
                    ▣
                  </div>
                )}
                <div className="flex-grow-1">
                  <h2 className="h6 mb-0">
                    <Link to={`/assets/${r.asset.id}`} className="text-decoration-none">
                      {r.asset.name}
                    </Link>
                  </h2>
                  <div className="small text-secondary font-monospace">{r.asset.serialNumber}</div>
                  <div className="mt-2">
                    <StatusBadge value={r.status} />
                    {r.isOverdue && <span className="badge bg-danger ms-1">Overdue</span>}
                  </div>
                  <div className="small mt-2">
                    Return by <strong>{formatDate(r.expectedReturnDate)}</strong>
                  </div>
                </div>
              </div>
              <div className="card-footer bg-transparent d-flex flex-wrap gap-2 align-items-center">
                <Link to={`/employee/requests/${r.id}`} className="btn btn-sm btn-outline-secondary">
                  View request
                </Link>
                {r.status === RequestStatus.ALLOCATED ? (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setReturning(r)}>
                    Initiate return
                  </button>
                ) : (
                  <span className="small text-secondary align-self-center">Return awaiting IT Staff confirmation</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">My assets</h1>
          {holdings.data && <small className="text-secondary">{holdings.data.data.length} unit(s) on loan</small>}
        </div>
        <Link to="/employee/requests" className="btn btn-outline-secondary btn-sm">
          All my requests
        </Link>
      </div>
      {notice && (
        <div className="alert alert-success py-2" role="status">
          {notice}
        </div>
      )}
      {content}
      <ConfirmDialog
        open={returning !== null}
        title="Initiate return?"
        body={
          <p className="mb-0">
            Let IT Staff know you are returning <strong>{returning?.asset.name}</strong> ({returning?.asset.serialNumber}). The loan completes once they confirm the unit's condition.
          </p>
        }
        confirmLabel="Initiate return"
        onConfirm={async () => {
          if (!returning) return;
          await initiateReturn(returning.id);
          setReturning(null);
          setNotice('Return initiated. IT Staff will confirm once the unit is back.');
          holdings.reload();
        }}
        onCancel={() => setReturning(null)}
      />
    </div>
  );
}

import { Link } from 'react-router-dom';
import type { RequestSummary } from '../../types';
import { formatDate } from '../../utils/format';
import { StatusBadge } from '../common/StatusBadge';

interface Props {
  rows: RequestSummary[];
  /** Detail route prefix, e.g. `/staff/requests` or `/employee/requests`. */
  linkBase: string;
  showRequester?: boolean;
}

export function RequestTable({ rows, linkBase, showRequester = false }: Props) {
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle" data-testid="request-table">
        <thead>
          <tr>
            <th scope="col">Asset</th>
            {showRequester && <th scope="col">Requester</th>}
            <th scope="col">Status</th>
            <th scope="col">Loan period</th>
            <th scope="col">Requested</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link to={`${linkBase}/${r.id}`} className="fw-semibold text-decoration-none">
                  {r.asset.name}
                </Link>
                <div className="small text-secondary font-monospace">{r.asset.serialNumber}</div>
              </td>
              {showRequester && (
                <td>
                  {r.requester.fullName}
                  {r.requester.department && <div className="small text-secondary">{r.requester.department}</div>}
                </td>
              )}
              <td>
                <StatusBadge value={r.status} />
                {r.isOverdue && <span className="badge bg-danger ms-1">Overdue</span>}
              </td>
              <td className="text-nowrap">
                {formatDate(r.requestedFrom)} → {formatDate(r.expectedReturnDate)}
              </td>
              <td className="text-nowrap">{formatDate(r.createdAt)}</td>
              <td className="text-end">
                <Link to={`${linkBase}/${r.id}`} className="btn btn-sm btn-outline-primary">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

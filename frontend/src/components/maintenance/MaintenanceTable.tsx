import { Link } from 'react-router-dom';
import type { Maintenance } from '../../types';
import { formatCost, formatDate, humanize } from '../../utils/format';
import { StatusBadge } from '../common/StatusBadge';

interface Props {
  rows: Maintenance[];
  /** Hidden on an asset's own page. */
  showAsset?: boolean;
}

export function MaintenanceTable({ rows, showAsset = true }: Props) {
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle" data-testid="maintenance-table">
        <thead>
          <tr>
            {showAsset && <th scope="col">Asset</th>}
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Started</th>
            <th scope="col">Completed</th>
            <th scope="col" className="text-end">
              Cost
            </th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              {showAsset && (
                <td>
                  <Link to={`/assets/${m.asset.id}`} className="fw-semibold text-decoration-none">
                    {m.asset.name}
                  </Link>
                  <div className="small text-secondary font-monospace">{m.asset.serialNumber}</div>
                </td>
              )}
              <td>
                {humanize(m.type)}
                <div className="small text-secondary text-truncate" style={{ maxWidth: 260 }}>
                  {m.description}
                </div>
              </td>
              <td>
                <StatusBadge value={m.status} />
                {m.resultingCondition && (
                  <div className="small text-secondary mt-1">
                    → <StatusBadge value={m.resultingCondition} />
                  </div>
                )}
              </td>
              <td className="text-nowrap">{formatDate(m.startedAt)}</td>
              <td className="text-nowrap">{formatDate(m.completedAt)}</td>
              <td className="text-end text-nowrap">{formatCost(m.cost)}</td>
              <td className="text-end">
                <Link to={`/staff/maintenance/${m.id}`} className="btn btn-sm btn-outline-primary">
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

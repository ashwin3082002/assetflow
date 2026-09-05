import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { listMaintenance } from '../../api/maintenance.api';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Loading } from '../../components/common/Loading';
import { Pagination } from '../../components/common/Pagination';
import { MaintenanceTable } from '../../components/maintenance/MaintenanceTable';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { MaintenanceStatus, MaintenanceType, type Maintenance } from '../../types';
import { humanize } from '../../utils/format';

const DEFAULT_FILTERS = { status: MaintenanceStatus.OPEN as string, type: '', search: '', sort: 'startedAt', order: 'desc' };

const TABS: { value: string; label: string }[] = [
  { value: MaintenanceStatus.OPEN, label: 'Open' },
  { value: MaintenanceStatus.COMPLETED, label: 'Completed' },
  { value: '', label: 'All' },
];

/** Staff maintenance list: status tabs, type filter, keyword search, sort and pagination synced to the URL. */
export function MaintenancePage() {
  const query = usePaginatedQuery<Maintenance>(listMaintenance, DEFAULT_FILTERS);
  const [search, setSearch] = useState(query.filters.search);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    query.setFilter('search', search.trim());
  };

  let content;
  if (query.isLoading) content = <Loading label="Loading maintenance records…" />;
  else if (query.error) content = <ErrorAlert error={query.error} onRetry={query.reload} />;
  else if (!query.data || query.data.length === 0)
    content = (
      <EmptyState
        title="No maintenance records"
        message={query.filters.search || query.filters.type ? 'Nothing matches these filters.' : query.filters.status === MaintenanceStatus.OPEN ? 'No unit is under maintenance right now.' : 'No records yet.'}
        icon="🛠️"
        action={
          <p className="small mb-0">
            Open maintenance from an asset's page: <Link to="/assets?status=AVAILABLE">browse assets</Link>.
          </p>
        }
      />
    );
  else
    content = (
      <>
        <MaintenanceTable rows={query.data} />
        {query.meta && <Pagination meta={query.meta} onPageChange={query.setPage} />}
      </>
    );

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">Maintenance</h1>
          {query.meta && !query.isLoading && <small className="text-secondary">{query.meta.total} record(s)</small>}
        </div>
        <form className="d-flex flex-wrap gap-2 align-items-end" onSubmit={submitSearch} role="search" aria-label="Maintenance search">
          <div>
            <label htmlFor="f-type" className="form-label small mb-1">
              Type
            </label>
            <select id="f-type" className="form-select form-select-sm" value={query.filters.type} onChange={(e) => query.setFilter('type', e.target.value)}>
              <option value="">All types</option>
              {Object.values(MaintenanceType).map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-sort" className="form-label small mb-1">
              Sort by
            </label>
            <select id="f-sort" className="form-select form-select-sm" value={query.filters.sort} onChange={(e) => query.setFilter('sort', e.target.value)}>
              <option value="startedAt">Started</option>
              <option value="completedAt">Completed</option>
              <option value="cost">Cost</option>
            </select>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => query.setFilter('order', query.filters.order === 'asc' ? 'desc' : 'asc')} aria-label={query.filters.order === 'asc' ? 'Sort descending' : 'Sort ascending'} title="Toggle sort order">
            {query.filters.order === 'asc' ? '↑' : '↓'}
          </button>
          <div className="input-group input-group-sm" style={{ maxWidth: 300 }}>
            <input id="f-search" className="form-control" placeholder="Asset name or serial" aria-label="Keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="submit" className="btn btn-outline-primary">
              Search
            </button>
          </div>
        </form>
      </div>

      <ul className="nav nav-pills flex-wrap mb-3" role="tablist" aria-label="Maintenance status">
        {TABS.map((tab) => (
          <li className="nav-item" key={tab.value || 'all'}>
            <button type="button" role="tab" aria-selected={query.filters.status === tab.value} className={`nav-link py-1 ${query.filters.status === tab.value ? 'active' : ''}`} onClick={() => query.setFilter('status', tab.value)}>
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {content}
    </div>
  );
}

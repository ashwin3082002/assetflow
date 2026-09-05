import { useState, type FormEvent } from 'react';
import { listRequests } from '../../api/requests.api';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Loading } from '../../components/common/Loading';
import { Pagination } from '../../components/common/Pagination';
import { RequestTable } from '../../components/requests/RequestTable';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { RequestStatus, type RequestSummary } from '../../types';
import { humanize } from '../../utils/format';

const DEFAULT_FILTERS = { status: RequestStatus.PENDING as string, overdue: '', search: '', sort: 'createdAt', order: 'desc' };

const TABS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  ...Object.values(RequestStatus).map((s) => ({ value: s, label: humanize(s) })),
];

/** Staff request queue: status tabs, overdue toggle, keyword search and pagination synced to the URL. */
export function RequestQueuePage() {
  const query = usePaginatedQuery<RequestSummary>(listRequests, DEFAULT_FILTERS);
  const [search, setSearch] = useState(query.filters.search);
  const overdue = query.filters.overdue === 'true';

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    query.setFilter('search', search.trim());
  };

  let content;
  if (query.isLoading) content = <Loading label="Loading requests…" />;
  else if (query.error) content = <ErrorAlert error={query.error} onRetry={query.reload} />;
  else if (!query.data || query.data.length === 0)
    content = (
      <EmptyState
        title="No requests here"
        message={overdue ? 'Nothing is overdue right now.' : query.filters.status ? `There are no ${humanize(query.filters.status).toLowerCase()} requests.` : 'No requests match your search.'}
        icon="✅"
      />
    );
  else
    content = (
      <>
        <RequestTable rows={query.data} linkBase="/staff/requests" showRequester />
        {query.meta && <Pagination meta={query.meta} onPageChange={query.setPage} />}
      </>
    );

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">Requests</h1>
          {query.meta && !query.isLoading && <small className="text-secondary">{query.meta.total} request(s)</small>}
        </div>
        <form className="d-flex flex-wrap gap-2 align-items-center" onSubmit={submitSearch} role="search" aria-label="Request search">
          <div className="form-check mb-0">
            <input id="f-overdue" type="checkbox" className="form-check-input" checked={overdue} onChange={(e) => query.setFilters({ overdue: e.target.checked ? 'true' : '', status: e.target.checked ? '' : DEFAULT_FILTERS.status })} />
            <label htmlFor="f-overdue" className="form-check-label small">
              Overdue only
            </label>
          </div>
          <div className="input-group input-group-sm" style={{ maxWidth: 320 }}>
            <input id="f-search" className="form-control" placeholder="Asset or requester name" aria-label="Keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="submit" className="btn btn-outline-primary">
              Search
            </button>
          </div>
        </form>
      </div>

      <ul className="nav nav-pills mb-3 flex-wrap" role="tablist" aria-label="Request status">
        {TABS.map((tab) => (
          <li className="nav-item" key={tab.value || 'all'}>
            <button
              type="button"
              role="tab"
              aria-selected={!overdue && query.filters.status === tab.value}
              className={`nav-link py-1 ${!overdue && query.filters.status === tab.value ? 'active' : ''}`}
              onClick={() => query.setFilters({ status: tab.value, overdue: '' })}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {content}
    </div>
  );
}

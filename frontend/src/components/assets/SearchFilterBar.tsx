import { useState, type FormEvent } from 'react';
import type { Filters } from '../../hooks/usePaginatedQuery';
import { AssetCondition, AssetStatus, type Category } from '../../types';
import { humanize } from '../../utils/format';

interface Props {
  filters: Filters;
  categories: Category[];
  /** Staff may filter by any status; employees only see the availability toggle. */
  canFilterStatus: boolean;
  onChange: (patch: Filters) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

const SORTS = [
  ['createdAt', 'Date added'],
  ['name', 'Name'],
  ['purchaseDate', 'Purchase date'],
  ['status', 'Status'],
] as const;

export function SearchFilterBar({ filters, categories, canFilterStatus, onChange, onClear, hasActiveFilters }: Props) {
  const [search, setSearch] = useState(filters.search);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    onChange({ search: search.trim() });
  };

  return (
    <form className="card card-body mb-3" onSubmit={submitSearch} role="search" aria-label="Asset filters">
      <div className="row g-2 align-items-end">
        <div className="col-12 col-md-4">
          <label htmlFor="f-search" className="form-label small mb-1">
            Keyword
          </label>
          <div className="input-group input-group-sm">
            <input id="f-search" className="form-control" placeholder="Name, description or serial" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="submit" className="btn btn-outline-primary">
              Search
            </button>
          </div>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="f-category" className="form-label small mb-1">
            Category
          </label>
          <select id="f-category" className="form-select form-select-sm" value={filters.categoryId} onChange={(e) => onChange({ categoryId: e.target.value })}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {canFilterStatus ? (
          <div className="col-6 col-md-2">
            <label htmlFor="f-status" className="form-label small mb-1">
              Status
            </label>
            <select id="f-status" className="form-select form-select-sm" value={filters.status} onChange={(e) => onChange({ status: e.target.value })}>
              <option value="">All</option>
              {Object.values(AssetStatus).map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="col-6 col-md-2">
            <div className="form-check mb-1">
              <input id="f-available" type="checkbox" className="form-check-input" checked={filters.availableOnly === 'true'} onChange={(e) => onChange({ availableOnly: e.target.checked ? 'true' : '' })} />
              <label htmlFor="f-available" className="form-check-label small">
                Available only
              </label>
            </div>
          </div>
        )}
        <div className="col-6 col-md-2">
          <label htmlFor="f-condition" className="form-label small mb-1">
            Condition
          </label>
          <select id="f-condition" className="form-select form-select-sm" value={filters.condition} onChange={(e) => onChange({ condition: e.target.value })}>
            <option value="">Any</option>
            {Object.values(AssetCondition).map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="f-sort" className="form-label small mb-1">
            Sort by
          </label>
          <div className="input-group input-group-sm">
            <select id="f-sort" className="form-select" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })}>
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-outline-secondary" aria-label={filters.order === 'asc' ? 'Sort descending' : 'Sort ascending'} title="Toggle sort order" onClick={() => onChange({ order: filters.order === 'asc' ? 'desc' : 'asc' })}>
              {filters.order === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="f-from" className="form-label small mb-1">
            Purchased from
          </label>
          <input id="f-from" type="date" className="form-control form-control-sm" value={filters.purchasedFrom} onChange={(e) => onChange({ purchasedFrom: e.target.value })} />
        </div>
        <div className="col-6 col-md-2">
          <label htmlFor="f-to" className="form-label small mb-1">
            Purchased to
          </label>
          <input id="f-to" type="date" className="form-control form-control-sm" value={filters.purchasedTo} onChange={(e) => onChange({ purchasedTo: e.target.value })} />
        </div>
        {hasActiveFilters && (
          <div className="col-auto">
            <button
              type="button"
              className="btn btn-sm btn-link"
              onClick={() => {
                setSearch('');
                onClear();
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

import { Link } from 'react-router-dom';
import { listAssets } from '../../api/assets.api';
import { listCategories } from '../../api/categories.api';
import { absoluteUrl } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { SearchFilterBar } from '../../components/assets/SearchFilterBar';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { Loading } from '../../components/common/Loading';
import { Pagination } from '../../components/common/Pagination';
import { RatingStars } from '../../components/common/RatingStars';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useApi } from '../../hooks/useApi';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import type { AssetSummary } from '../../types';
import { formatDate } from '../../utils/format';
import { isStaff } from '../../utils/roles';

const DEFAULT_FILTERS = {
  search: '',
  categoryId: '',
  status: '',
  availableOnly: '',
  condition: '',
  purchasedFrom: '',
  purchasedTo: '',
  sort: 'createdAt',
  order: 'desc',
};

export function AssetListPage() {
  const { user } = useAuth();
  const staff = !!user && isStaff(user.role);
  const query = usePaginatedQuery<AssetSummary>((params) => listAssets({ ...params, limit: '12' }), DEFAULT_FILTERS);
  const categories = useApi(listCategories, []);

  let content;
  if (query.isLoading) {
    content = <Loading label="Loading assets…" />;
  } else if (query.error) {
    content = <ErrorAlert error={query.error} onRetry={query.reload} />;
  } else if (!query.data || query.data.length === 0) {
    content = (
      <EmptyState
        title="No assets found"
        message={query.hasActiveFilters ? 'Try widening or clearing your filters.' : staff ? 'Add the first asset to get started.' : 'No assets have been registered yet.'}
        action={
          query.hasActiveFilters ? (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={query.clearFilters}>
              Clear filters
            </button>
          ) : staff ? (
            <Link to="/assets/new" className="btn btn-primary btn-sm">
              Add asset
            </Link>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <>
        <div className="table-responsive">
          <table className="table table-hover align-middle" data-testid="asset-table">
            <thead>
              <tr>
                <th scope="col" style={{ width: 56 }}>
                  <span className="visually-hidden">Image</span>
                </th>
                <th scope="col">Asset</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Condition</th>
                <th scope="col">Managed by</th>
                <th scope="col">Rating</th>
                <th scope="col">Purchased</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    {asset.imageUrl ? (
                      <img src={absoluteUrl(asset.imageUrl)} alt="" width={40} height={40} className="rounded object-fit-cover" />
                    ) : (
                      <div className="bg-light rounded d-flex align-items-center justify-content-center text-secondary" style={{ width: 40, height: 40 }} aria-hidden="true">
                        ▣
                      </div>
                    )}
                  </td>
                  <td>
                    <Link to={`/assets/${asset.id}`} className="fw-semibold text-decoration-none">
                      {asset.name}
                    </Link>
                    <div className="small text-secondary font-monospace">{asset.serialNumber}</div>
                  </td>
                  <td>{asset.category.name}</td>
                  <td>
                    <StatusBadge value={asset.status} />
                  </td>
                  <td>
                    <StatusBadge value={asset.condition} />
                  </td>
                  <td>{asset.managedBy.fullName}</td>
                  <td>
                    <RatingStars value={asset.avgRating} count={asset.reviewCount} />
                  </td>
                  <td>{formatDate(asset.purchaseDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {query.meta && <Pagination meta={query.meta} onPageChange={query.setPage} />}
      </>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h1 className="h3 mb-0">Assets</h1>
          {query.meta && !query.isLoading && <small className="text-secondary">{query.meta.total} unit(s)</small>}
        </div>
        {staff && (
          <Link to="/assets/new" className="btn btn-primary">
            Add asset
          </Link>
        )}
      </div>

      {!!categories.error && <ErrorAlert error={categories.error} onRetry={categories.reload} className="py-2" />}
      <SearchFilterBar
        filters={query.filters}
        categories={categories.data ?? []}
        canFilterStatus={staff}
        onChange={query.setFilters}
        onClear={query.clearFilters}
        hasActiveFilters={query.hasActiveFilters}
      />

      {content}
    </div>
  );
}

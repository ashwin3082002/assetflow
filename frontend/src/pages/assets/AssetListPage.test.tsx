import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext } from '../../auth/AuthContext';
import { AssetListPage } from './AssetListPage';
import { makeAuth, makeUser } from '../../test/helpers';
import { AssetCondition, AssetStatus, UserRole, type ApiError, type AssetSummary, type Category } from '../../types';
import * as assetsApi from '../../api/assets.api';
import * as categoriesApi from '../../api/categories.api';

vi.mock('../../api/assets.api');
vi.mock('../../api/categories.api');

const listAssets = vi.mocked(assetsApi.listAssets);
const listCategories = vi.mocked(categoriesApi.listCategories);

const categories: Category[] = [
  { id: 'c1', name: 'Laptop', description: null, assetCount: 2, createdAt: '', updatedAt: '' },
  { id: 'c2', name: 'Monitor', description: null, assetCount: 0, createdAt: '', updatedAt: '' },
];

function asset(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    id: 'a1',
    name: 'Dell Latitude',
    serialNumber: 'SN-1',
    status: AssetStatus.AVAILABLE,
    condition: AssetCondition.GOOD,
    imageUrl: null,
    purchaseDate: '2025-01-01',
    maxLoanDays: 30,
    location: null,
    category: { id: 'c1', name: 'Laptop' },
    managedBy: { id: 's1', fullName: 'Sam Staff' },
    avgRating: 4.5,
    reviewCount: 2,
    ...overrides,
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderPage(role: UserRole = UserRole.EMPLOYEE, initialPath = '/assets') {
  return render(
    <AuthContext.Provider value={makeAuth({ user: makeUser({ role }) })}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/assets"
            element={
              <>
                <AssetListPage />
                <LocationDisplay />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('AssetListPage', () => {
  beforeEach(() => {
    listCategories.mockResolvedValue(categories);
  });

  it('renders Loading, then the data table', async () => {
    listAssets.mockResolvedValue({ data: [asset(), asset({ id: 'a2', name: 'LG Monitor', serialNumber: 'SN-2', status: AssetStatus.ALLOCATED })], meta: { page: 1, limit: 12, total: 2, totalPages: 1 } });
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Loading assets');
    expect(await screen.findByText('Dell Latitude')).toBeInTheDocument();
    expect(screen.getByText('LG Monitor')).toBeInTheDocument();
    expect(screen.getByText('Allocated')).toHaveClass('badge');
    expect(screen.getAllByText('4.5 (2)')).toHaveLength(2);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(listAssets).toHaveBeenCalledWith({ page: '1', sort: 'createdAt', order: 'desc', limit: '12' });
  });

  it('renders EmptyState when the list is empty', async () => {
    listAssets.mockResolvedValue({ data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 0 } });
    renderPage();
    expect(await screen.findByTestId('empty-state')).toHaveTextContent('No assets found');
    expect(screen.queryByTestId('asset-table')).not.toBeInTheDocument();
  });

  it('renders ErrorAlert with a working retry on failure', async () => {
    const apiError: ApiError = { status: 500, code: 'INTERNAL_ERROR', message: 'Database exploded' };
    listAssets.mockRejectedValueOnce(apiError).mockResolvedValueOnce({ data: [asset()], meta: { page: 1, limit: 12, total: 1, totalPages: 1 } });
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Database exploded');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Dell Latitude')).toBeInTheDocument();
    expect(listAssets).toHaveBeenCalledTimes(2);
  });

  it('changing a filter updates the URL query string and refetches', async () => {
    listAssets.mockResolvedValue({ data: [asset()], meta: { page: 1, limit: 12, total: 1, totalPages: 1 } });
    renderPage();
    await screen.findByText('Dell Latitude');

    await userEvent.selectOptions(await screen.findByLabelText('Category'), 'c2');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?categoryId=c2'));
    await waitFor(() => expect(listAssets).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 'c2', page: '1' })));

    await userEvent.type(screen.getByLabelText('Keyword'), 'dell{enter}');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('categoryId=c2&search=dell'));
    await waitFor(() => expect(listAssets).toHaveBeenLastCalledWith(expect.objectContaining({ categoryId: 'c2', search: 'dell' })));
  });

  it('reads initial filters from the URL and can clear them', async () => {
    listAssets.mockResolvedValue({ data: [], meta: { page: 1, limit: 12, total: 0, totalPages: 0 } });
    renderPage(UserRole.EMPLOYEE, '/assets?availableOnly=true&page=3');
    await screen.findByTestId('empty-state');
    expect(listAssets).toHaveBeenCalledWith(expect.objectContaining({ availableOnly: 'true', page: '3' }));
    expect(screen.getByLabelText('Available only')).toBeChecked();
    expect(screen.getByTestId('empty-state')).toHaveTextContent('widening or clearing your filters');

    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(''));
    await waitFor(() => expect(listAssets).toHaveBeenLastCalledWith({ page: '1', sort: 'createdAt', order: 'desc', limit: '12' }));
  });

  it('shows the status filter and "Add asset" to staff but not to employees', async () => {
    listAssets.mockResolvedValue({ data: [asset()], meta: { page: 1, limit: 12, total: 1, totalPages: 1 } });
    const { unmount } = renderPage(UserRole.IT_STAFF);
    await screen.findByText('Dell Latitude');
    expect(screen.getByRole('link', { name: 'Add asset' })).toHaveAttribute('href', '/assets/new');
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.queryByLabelText('Available only')).not.toBeInTheDocument();
    unmount();

    renderPage(UserRole.EMPLOYEE);
    await screen.findByText('Dell Latitude');
    expect(screen.queryByRole('link', { name: 'Add asset' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Available only')).toBeInTheDocument();
  });
});

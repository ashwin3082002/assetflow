import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetDetailPage } from './AssetDetailPage';
import { makeAuth, makeUser, renderWithAuth } from '../../test/helpers';
import { AssetCondition, AssetStatus, MaintenanceStatus, MaintenanceType, UserRole, type Asset, type Maintenance, type RequestDetail } from '../../types';
import * as assetsApi from '../../api/assets.api';
import * as requestsApi from '../../api/requests.api';
import * as reviewsApi from '../../api/reviews.api';
import * as maintenanceApi from '../../api/maintenance.api';

vi.mock('../../api/assets.api');
vi.mock('../../api/requests.api');
vi.mock('../../api/reviews.api');
vi.mock('../../api/maintenance.api');

const getAsset = vi.mocked(assetsApi.getAsset);
const retireAsset = vi.mocked(assetsApi.retireAsset);
const listAssetRequests = vi.mocked(assetsApi.listAssetRequests);
const createRequest = vi.mocked(requestsApi.createRequest);
const listAssetReviews = vi.mocked(reviewsApi.listAssetReviews);
const openMaintenance = vi.mocked(maintenanceApi.openMaintenance);

const openRecord: Maintenance = {
  id: 'm1',
  type: MaintenanceType.REPAIR,
  status: MaintenanceStatus.OPEN,
  description: 'Fan is rattling',
  startedAt: '2026-09-01T10:00:00.000Z',
  completedAt: null,
  cost: 25,
  resultingCondition: null,
  asset: { id: 'a1', name: 'Dell Latitude', serialNumber: 'SN-1' },
  createdBy: { id: 's1', fullName: 'Sam Staff' },
  createdAt: '2026-09-01T10:00:00.000Z',
};

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    name: 'Dell Latitude',
    description: 'A laptop',
    serialNumber: 'SN-1',
    status: AssetStatus.AVAILABLE,
    condition: AssetCondition.GOOD,
    imageUrl: null,
    purchaseDate: '2025-01-01',
    maxLoanDays: 30,
    location: 'Rack A1',
    category: { id: 'c1', name: 'Laptop' },
    managedBy: { id: 's1', fullName: 'Sam Staff' },
    avgRating: null,
    reviewCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const activeRequest = {
  id: 'r1',
  status: 'ALLOCATED' as const,
  purpose: 'Field work',
  requestedFrom: '2026-01-01',
  expectedReturnDate: '2026-01-10',
  isOverdue: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  asset: { id: 'a1', name: 'Dell Latitude', serialNumber: 'SN-1', imageUrl: null },
  requester: { id: 'e1', fullName: 'Eli Employee', department: 'Engineering' },
};

function renderPage(role: UserRole) {
  return renderWithAuth(<AssetDetailPage />, {
    auth: makeAuth({ user: makeUser({ role }) }),
    path: '/assets/:id',
    extraRoutes: { '/assets': <div>List</div>, '/employee/requests/:id': <div>Request page</div>, '/staff/maintenance/:id': <div>Maintenance page</div> },
  });
}

describe('AssetDetailPage', () => {
  beforeEach(() => {
    // renderWithAuth mounts at the literal path, so the :id param is the string ":id"; the mocks ignore it.
    getAsset.mockImplementation(async () => asset());
    listAssetRequests.mockResolvedValue({ data: [], meta: { page: 1, limit: 5, total: 0, totalPages: 0 } });
    listAssetReviews.mockResolvedValue({ data: [], meta: { page: 1, limit: 5, total: 0, totalPages: 0 }, summary: { avgRating: null, reviewCount: 0 } });
  });

  it('shows the asset reviews with the aggregate to every role', async () => {
    listAssetReviews.mockResolvedValue({
      data: [{ id: 'rv1', rating: 4, comment: 'Solid machine', createdAt: '2026-08-01T00:00:00.000Z', reviewer: { id: 'e1', fullName: 'Eli Employee' }, asset: { id: 'a1', name: 'Dell Latitude' }, requestId: 'r1' }],
      meta: { page: 1, limit: 5, total: 1, totalPages: 1 },
      summary: { avgRating: 4, reviewCount: 1 },
    });
    renderPage(UserRole.EMPLOYEE);
    expect(await screen.findByTestId('review-list')).toHaveTextContent('Solid machine');
    expect(screen.getByTestId('review-list')).toHaveTextContent('Eli Employee');
    expect(listAssetReviews).toHaveBeenCalledWith(':id', { limit: '5' });
  });

  it('staff can open maintenance on an AVAILABLE unit; the form validates and navigates to the new record', async () => {
    openMaintenance.mockResolvedValue(openRecord);
    renderPage(UserRole.IT_STAFF);
    await userEvent.click(await screen.findByRole('button', { name: 'Open maintenance' }));
    const form = screen.getByRole('form', { name: 'Open maintenance' });
    await userEvent.click(within(form).getByRole('button', { name: 'Open maintenance' }));
    expect(within(form).getByText(/at least 5 characters/)).toBeInTheDocument();
    expect(openMaintenance).not.toHaveBeenCalled();

    await userEvent.selectOptions(within(form).getByLabelText('Type'), MaintenanceType.INSPECTION);
    await userEvent.type(within(form).getByLabelText('Description'), 'Annual inspection');
    await userEvent.type(within(form).getByLabelText(/Estimated cost/), '12.5');
    await userEvent.click(within(form).getByRole('button', { name: 'Open maintenance' }));
    expect(await screen.findByText('Maintenance page')).toBeInTheDocument();
    expect(openMaintenance).toHaveBeenCalledWith({ assetId: 'a1', type: 'INSPECTION', description: 'Annual inspection', cost: 12.5 });
  });

  it('staff cannot open a second record or retire while one is OPEN; history links to the record', async () => {
    getAsset.mockImplementation(async () => asset({ status: AssetStatus.UNDER_MAINTENANCE, activeRequest: null, recentMaintenance: [openRecord] }));
    renderPage(UserRole.ADMIN);
    expect(await screen.findByRole('button', { name: 'Open maintenance' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retire' })).toBeDisabled();
    expect(within(screen.getByTestId('maintenance-history')).getByRole('link', { name: 'Repair' })).toHaveAttribute('href', '/staff/maintenance/m1');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('staff sees the damaged-return warning and can open a record when UNDER_MAINTENANCE without an OPEN one', async () => {
    getAsset.mockImplementation(async () => asset({ status: AssetStatus.UNDER_MAINTENANCE, condition: AssetCondition.DAMAGED, activeRequest: null, recentMaintenance: [] }));
    renderPage(UserRole.IT_STAFF);
    expect(await screen.findByRole('note')).toHaveTextContent(/damaged/);
    expect(screen.getByRole('button', { name: 'Open maintenance' })).toBeEnabled();
  });

  it('employee never sees maintenance controls or history', async () => {
    renderPage(UserRole.EMPLOYEE);
    expect(await screen.findByRole('heading', { level: 1, name: /Dell Latitude/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open maintenance' })).not.toBeInTheDocument();
    expect(screen.queryByText('Maintenance history')).not.toBeInTheDocument();
  });

  it('employee sees an enabled "Request this asset" button only when the asset is AVAILABLE', async () => {
    renderPage(UserRole.EMPLOYEE);
    expect(await screen.findByRole('button', { name: 'Request this asset' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();
    expect(screen.queryByText('Active request')).not.toBeInTheDocument();
    expect(listAssetRequests).not.toHaveBeenCalled();
  });

  it.each([AssetStatus.ALLOCATED, AssetStatus.RESERVED, AssetStatus.UNDER_MAINTENANCE])('employee has no request button when status is %s', async (status) => {
    getAsset.mockImplementation(async () => asset({ status }));
    renderPage(UserRole.EMPLOYEE);
    expect(await screen.findByRole('heading', { level: 1, name: /Dell Latitude/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request this asset' })).not.toBeInTheDocument();
  });

  it('employee request form validates locally, shows server errors inline and navigates on success', async () => {
    renderPage(UserRole.EMPLOYEE);
    await userEvent.click(await screen.findByRole('button', { name: 'Request this asset' }));
    const form = screen.getByRole('form', { name: 'Request this asset' });
    expect(within(form).getByText(/at most 30 days/)).toBeInTheDocument();

    // Client-side: purpose too short → no API call.
    await userEvent.click(within(form).getByRole('button', { name: 'Submit request' }));
    expect(within(form).getByText(/at least 5 characters/)).toBeInTheDocument();
    expect(createRequest).not.toHaveBeenCalled();

    await userEvent.type(within(form).getByLabelText('Purpose'), 'Client presentation');

    // Server-side 409 is shown inline and the form stays open.
    createRequest.mockRejectedValueOnce({ status: 409, code: 'ASSET_NOT_AVAILABLE', message: 'Asset is reserved and cannot be requested' });
    await userEvent.click(within(form).getByRole('button', { name: 'Submit request' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Asset is reserved and cannot be requested');
    expect(createRequest).toHaveBeenLastCalledWith(expect.objectContaining({ assetId: 'a1', purpose: 'Client presentation' }));

    // Success navigates to the new request.
    createRequest.mockResolvedValueOnce({ id: 'r9' } as RequestDetail);
    await userEvent.click(within(form).getByRole('button', { name: 'Submit request' }));
    expect(await screen.findByText('Request page')).toBeInTheDocument();
  });

  it('staff sees Edit, Retire and Delete plus the active request block and request history', async () => {
    getAsset.mockImplementation(async () => asset({ status: AssetStatus.ALLOCATED, activeRequest, recentMaintenance: [] }));
    listAssetRequests.mockResolvedValue({ data: [activeRequest], meta: { page: 1, limit: 5, total: 1, totalPages: 1 } });
    renderPage(UserRole.IT_STAFF);
    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/assets/a1/edit');
    expect(screen.getByRole('button', { name: 'Retire' })).toBeDisabled(); // ALLOCATED cannot be retired
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Request this asset' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Eli Employee').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Open request' })).toHaveAttribute('href', '/staff/requests/r1');
    await waitFor(() => expect(screen.getByTestId('request-table')).toBeInTheDocument());
    expect(listAssetRequests).toHaveBeenCalledWith(':id', { limit: '5' });
  });

  it('staff retire flow confirms, calls the API and reloads', async () => {
    retireAsset.mockResolvedValue(asset({ status: AssetStatus.RETIRED }));
    renderPage(UserRole.ADMIN);
    await userEvent.click(await screen.findByRole('button', { name: 'Retire' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Retire this asset?');
    getAsset.mockImplementation(async () => asset({ status: AssetStatus.RETIRED }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retire' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Asset retired.');
    expect(retireAsset).toHaveBeenCalledWith('a1');
    expect(getAsset).toHaveBeenCalledTimes(2);
  });

  it('shows ErrorAlert with retry when loading fails', async () => {
    getAsset.mockRejectedValueOnce({ status: 404, code: 'NOT_FOUND', message: 'Asset not found' });
    renderPage(UserRole.EMPLOYEE);
    expect(await screen.findByRole('alert')).toHaveTextContent('Asset not found');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Dell Latitude/ })).toBeInTheDocument();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestDetailPage } from './RequestDetailPage';
import { makeAuth, makeUser, renderWithAuth } from '../../test/helpers';
import { AssetCondition, AssetStatus, RequestStatus, UserRole, type Asset, type RequestDetail } from '../../types';
import * as assetsApi from '../../api/assets.api';
import * as requestsApi from '../../api/requests.api';

vi.mock('../../api/assets.api');
vi.mock('../../api/requests.api');

const getRequest = vi.mocked(requestsApi.getRequest);
const getAsset = vi.mocked(assetsApi.getAsset);
const rejectRequest = vi.mocked(requestsApi.rejectRequest);
const completeRequest = vi.mocked(requestsApi.completeRequest);
const cancelRequest = vi.mocked(requestsApi.cancelRequest);

function request(overrides: Partial<RequestDetail> = {}): RequestDetail {
  return {
    id: 'r1',
    status: RequestStatus.PENDING,
    purpose: 'Client presentation',
    requestedFrom: '2026-09-10',
    expectedReturnDate: '2026-09-20',
    isOverdue: false,
    createdAt: '2026-09-04T10:00:00.000Z',
    asset: { id: 'a1', name: 'Dell Latitude', serialNumber: 'SN-1', imageUrl: null },
    requester: { id: 'u1', fullName: 'Eli Employee', department: 'Engineering' },
    processedBy: null,
    approvedAt: null,
    rejectedAt: null,
    allocatedAt: null,
    returnInitiatedAt: null,
    completedAt: null,
    cancelledAt: null,
    rejectionReason: null,
    returnCondition: null,
    returnNotes: null,
    review: null,
    ...overrides,
  };
}

function asset(status: AssetStatus): Asset {
  return {
    id: 'a1',
    name: 'Dell Latitude',
    description: 'A laptop',
    serialNumber: 'SN-1',
    status,
    condition: AssetCondition.GOOD,
    imageUrl: null,
    purchaseDate: null,
    maxLoanDays: 30,
    location: null,
    category: { id: 'c1', name: 'Laptop' },
    managedBy: { id: 's1', fullName: 'Sam Staff' },
    avgRating: null,
    reviewCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderPage(role: UserRole) {
  const staff = role !== UserRole.EMPLOYEE;
  return renderWithAuth(<RequestDetailPage />, {
    auth: makeAuth({ user: makeUser({ id: 'u1', role }) }),
    path: staff ? '/staff/requests/:id' : '/employee/requests/:id',
  });
}

function actionNames() {
  return within(screen.getByTestId('request-actions'))
    .queryAllByRole('button')
    .map((b) => b.textContent);
}

describe('RequestDetailPage (staff)', () => {
  beforeEach(() => {
    getAsset.mockImplementation(async () => asset(AssetStatus.AVAILABLE));
  });

  it.each([
    [RequestStatus.PENDING, ['Approve', 'Reject']],
    [RequestStatus.APPROVED, ['Allocate', 'Reject']],
    [RequestStatus.ALLOCATED, ['Complete return']],
    [RequestStatus.RETURN_PENDING, ['Complete return']],
    [RequestStatus.COMPLETED, []],
    [RequestStatus.REJECTED, []],
    [RequestStatus.CANCELLED, []],
  ])('shows the right actions for a %s request', async (status, expected) => {
    getRequest.mockImplementation(async () => request({ status }));
    renderPage(UserRole.IT_STAFF);
    expect(await screen.findByRole('heading', { level: 1, name: /Request for Dell Latitude/ })).toBeInTheDocument();
    await waitFor(() => expect(actionNames()).toEqual(expected));
    expect(screen.getByRole('list', { name: 'Request timeline' })).toBeInTheDocument();
  });

  it('disables Approve with a hint when the unit is no longer AVAILABLE', async () => {
    getRequest.mockImplementation(async () => request({ status: RequestStatus.PENDING }));
    getAsset.mockImplementation(async () => asset(AssetStatus.RESERVED));
    renderPage(UserRole.ADMIN);
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeDisabled());
    expect(screen.getByRole('note')).toHaveTextContent(/currently Reserved/);
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('reject requires a reason, then calls the API with it and reloads', async () => {
    getRequest.mockImplementation(async () => request({ status: RequestStatus.PENDING }));
    rejectRequest.mockResolvedValue(request({ status: RequestStatus.REJECTED }));
    renderPage(UserRole.IT_STAFF);
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/give a reason/);
    expect(rejectRequest).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Out of stock');
    getRequest.mockImplementation(async () => request({ status: RequestStatus.REJECTED, rejectionReason: 'Out of stock' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Request rejected.');
    expect(rejectRequest).toHaveBeenCalledWith('r1', 'Out of stock');
    expect(await screen.findByText('Out of stock')).toBeInTheDocument();
    expect(actionNames()).toEqual([]);
  });

  it('complete return sends the chosen condition and notes; DAMAGED explains the maintenance hand-off', async () => {
    getRequest.mockImplementation(async () => request({ status: RequestStatus.RETURN_PENDING, returnInitiatedAt: '2026-09-15T09:00:00.000Z' }));
    completeRequest.mockResolvedValue(request({ status: RequestStatus.COMPLETED }));
    renderPage(UserRole.IT_STAFF);
    await userEvent.click(await screen.findByRole('button', { name: 'Complete return' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Condition on return'), AssetCondition.DAMAGED);
    expect(dialog).toHaveTextContent(/goes to maintenance/);
    await userEvent.type(within(dialog).getByLabelText('Notes (optional)'), 'Cracked lid');
    getRequest.mockImplementation(async () => request({ status: RequestStatus.COMPLETED, returnCondition: AssetCondition.DAMAGED }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Complete return' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/moved to maintenance/);
    expect(completeRequest).toHaveBeenCalledWith('r1', { returnCondition: 'DAMAGED', returnNotes: 'Cracked lid' });
  });

  it('shows the API error inside the dialog when a transition fails', async () => {
    getRequest.mockImplementation(async () => request({ status: RequestStatus.APPROVED, approvedAt: '2026-09-05T10:00:00.000Z' }));
    vi.mocked(requestsApi.allocateRequest).mockRejectedValue({ status: 409, code: 'INVALID_STATE_TRANSITION', message: 'Request is now CANCELLED' });
    renderPage(UserRole.IT_STAFF);
    await userEvent.click(await screen.findByRole('button', { name: 'Allocate' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Allocate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Request is now CANCELLED');
  });
});

describe('RequestDetailPage (employee)', () => {
  it.each([
    [RequestStatus.PENDING, ['Cancel request']],
    [RequestStatus.APPROVED, ['Cancel request']],
    [RequestStatus.ALLOCATED, ['Initiate return']],
    [RequestStatus.RETURN_PENDING, []],
    [RequestStatus.COMPLETED, []],
  ])('shows the right actions for a %s request and never fetches the asset', async (status, expected) => {
    getRequest.mockImplementation(async () => request({ status }));
    renderPage(UserRole.EMPLOYEE);
    expect(await screen.findByRole('heading', { level: 1, name: /Request for Dell Latitude/ })).toBeInTheDocument();
    expect(actionNames()).toEqual(expected);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(getAsset).not.toHaveBeenCalled();
  });

  it('cancel confirms then calls the API', async () => {
    getRequest.mockImplementation(async () => request({ status: RequestStatus.PENDING }));
    cancelRequest.mockResolvedValue(request({ status: RequestStatus.CANCELLED }));
    renderPage(UserRole.EMPLOYEE);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request' }));
    const dialog = screen.getByRole('dialog');
    getRequest.mockImplementation(async () => request({ status: RequestStatus.CANCELLED, cancelledAt: '2026-09-05T10:00:00.000Z' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Request cancelled.');
    expect(cancelRequest).toHaveBeenCalledWith('r1');
  });

  it('shows ErrorAlert with retry when the request cannot be loaded (e.g. 403 for a foreign request)', async () => {
    getRequest.mockRejectedValueOnce({ status: 403, code: 'FORBIDDEN', message: 'You can only act on your own requests' });
    getRequest.mockImplementation(async () => request());
    renderPage(UserRole.EMPLOYEE);
    expect(await screen.findByRole('alert')).toHaveTextContent('You can only act on your own requests');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Request for Dell Latitude/ })).toBeInTheDocument();
  });
});

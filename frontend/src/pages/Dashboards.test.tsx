import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDashboard } from './admin/AdminDashboard';
import { StaffDashboard } from './staff/StaffDashboard';
import { EmployeeDashboard } from './employee/EmployeeDashboard';
import { makeAuth, makeUser, renderWithAuth } from '../test/helpers';
import { AssetCondition, AssetStatus, MaintenanceStatus, MaintenanceType, RequestStatus, UserRole, type AdminDashboardData, type AssetSummary, type EmployeeDashboardData, type Maintenance, type RequestSummary, type StaffDashboardData } from '../types';
import * as dashboardApi from '../api/dashboard.api';

vi.mock('../api/dashboard.api');

const getAdminDashboard = vi.mocked(dashboardApi.getAdminDashboard);
const getStaffDashboard = vi.mocked(dashboardApi.getStaffDashboard);
const getEmployeeDashboard = vi.mocked(dashboardApi.getEmployeeDashboard);

const request = (overrides: Partial<RequestSummary> = {}): RequestSummary => ({
  id: 'r1',
  status: RequestStatus.PENDING,
  purpose: 'Field work',
  requestedFrom: '2026-09-01',
  expectedReturnDate: '2026-09-10',
  isOverdue: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  asset: { id: 'a1', name: 'Dell Latitude', serialNumber: 'SN-1', imageUrl: null },
  requester: { id: 'e1', fullName: 'Eli Employee', department: null },
  ...overrides,
});

const maintenance: Maintenance = {
  id: 'm1',
  type: MaintenanceType.REPAIR,
  status: MaintenanceStatus.OPEN,
  description: 'Fan',
  startedAt: '2026-09-01T00:00:00.000Z',
  completedAt: null,
  cost: null,
  resultingCondition: null,
  asset: { id: 'a2', name: 'HP Printer', serialNumber: 'SN-2' },
  createdBy: { id: 's1', fullName: 'Sam Staff' },
  createdAt: '2026-09-01T00:00:00.000Z',
};

const assetSummary = (overrides: Partial<AssetSummary> = {}): AssetSummary => ({
  id: 'a3',
  name: 'Jabra Headset',
  serialNumber: 'SN-3',
  status: AssetStatus.UNDER_MAINTENANCE,
  condition: AssetCondition.DAMAGED,
  imageUrl: null,
  purchaseDate: null,
  maxLoanDays: null,
  location: null,
  category: { id: 'c1', name: 'Audio' },
  managedBy: { id: 's1', fullName: 'Sam Staff' },
  avgRating: null,
  reviewCount: 0,
  ...overrides,
});

const byStatus = { AVAILABLE: 4, RESERVED: 1, ALLOCATED: 2, UNDER_MAINTENANCE: 1, RETIRED: 0 };

const adminData: AdminDashboardData = {
  users: { total: 6, byRole: { ADMIN: 1, IT_STAFF: 2, EMPLOYEE: 3 }, inactive: 1 },
  assets: { total: 8, byStatus },
  requests: { pending: 2, approved: 1, allocated: 2, returnPending: 0, overdue: 1, completedLast30Days: 3 },
  maintenance: { open: 1, completedLast30Days: 2, totalCostLast30Days: 214.5 },
  assetsByCategory: [
    { categoryId: 'c1', name: 'Audio', total: 2, available: 1 },
    { categoryId: 'c2', name: 'Laptops', total: 6, available: 3 },
  ],
  recentRequests: [request()],
  recentMaintenance: [maintenance],
  topRatedAssets: [{ assetId: 'a1', name: 'Dell Latitude', avgRating: 4.5, reviewCount: 2 }],
};

const staffData: StaffDashboardData = {
  counts: { pending: 1, awaitingAllocation: 0, returnPending: 0, overdue: 1, openMaintenance: 1, needsMaintenanceRecord: 1 },
  inventory: { byStatus, total: 8 },
  pendingRequests: [request()],
  awaitingAllocation: [],
  returnPending: [],
  overdue: [request({ id: 'r2', status: RequestStatus.ALLOCATED, isOverdue: true })],
  openMaintenance: [maintenance],
  needsMaintenanceRecord: [assetSummary()],
  recentlyAdded: [assetSummary({ id: 'a4', name: 'Logitech Mouse', status: AssetStatus.AVAILABLE, condition: AssetCondition.NEW })],
};

const employeeData: EmployeeDashboardData = {
  counts: { activeAssets: 1, pendingRequests: 1, approvedRequests: 0, reviewsSubmitted: 1, availableAssets: 4 },
  activeAssets: [request({ id: 'r2', status: RequestStatus.ALLOCATED, isOverdue: true })],
  pendingRequests: [request()],
  recentStatusChanges: [request({ id: 'r3', status: RequestStatus.COMPLETED })],
  pendingReviews: [request({ id: 'r3', status: RequestStatus.COMPLETED })],
};

function renderAs(role: UserRole, ui: React.ReactNode, path: string) {
  return renderWithAuth(ui, { auth: makeAuth({ user: makeUser({ id: 'u1', fullName: 'Pat', role }) }), path });
}

describe('AdminDashboard', () => {
  it('renders totals, breakdowns, category table, recent lists and top rated', async () => {
    getAdminDashboard.mockResolvedValue(adminData);
    renderAs(UserRole.ADMIN, <AdminDashboard />, '/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users: 6' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'Overdue loans: 1' })).toBeInTheDocument();
    expect(screen.getByText('214.50')).toBeInTheDocument();
    expect(within(screen.getByTestId('users-by-role')).getByText('3')).toBeInTheDocument();
    const categories = within(screen.getByTestId('assets-by-category'));
    expect(categories.getByRole('link', { name: 'Laptops' })).toHaveAttribute('href', '/assets?categoryId=c2');
    expect(categories.getByRole('progressbar', { name: 'Laptops: 50% available' })).toBeInTheDocument();
    expect(screen.getByTestId('request-table')).toHaveTextContent('Eli Employee');
    expect(screen.getByTestId('maintenance-table')).toHaveTextContent('HP Printer');
    expect(within(screen.getByTestId('top-rated')).getByRole('link', { name: 'Dell Latitude' })).toHaveAttribute('href', '/assets/a1');
  });

  it('shows ErrorAlert with retry when the endpoint fails', async () => {
    getAdminDashboard.mockRejectedValueOnce({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' });
    getAdminDashboard.mockResolvedValue(adminData);
    renderAs(UserRole.ADMIN, <AdminDashboard />, '/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Admin dashboard' })).toBeInTheDocument();
  });
});

describe('StaffDashboard', () => {
  it('renders queues with links to detail pages, the needs-record warning and inventory', async () => {
    getStaffDashboard.mockResolvedValue(staffData);
    renderAs(UserRole.IT_STAFF, <StaffDashboard />, '/staff');
    expect(await screen.findByRole('heading', { level: 1, name: 'IT Staff dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending approval: 1' })).toHaveAttribute('href', '/staff/requests?status=PENDING');
    expect(screen.getByRole('link', { name: 'Overdue: 1' })).toHaveAttribute('href', '/staff/requests?status=&overdue=true');

    const warning = within(screen.getByTestId('needs-record'));
    expect(warning.getByRole('link', { name: 'Jabra Headset' })).toHaveAttribute('href', '/assets/a3');

    const tables = screen.getAllByTestId('request-table');
    expect(tables).toHaveLength(2); // pending + overdue; empty queues render text instead
    expect(within(tables[0]).getByRole('link', { name: 'View' })).toHaveAttribute('href', '/staff/requests/r1');
    expect(screen.getByText('Nothing reserved for hand-over.')).toBeInTheDocument();
    expect(screen.getByTestId('maintenance-table')).toHaveTextContent('HP Printer');
    expect(within(screen.getByTestId('inventory')).getByText('8')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Logitech Mouse' })).toHaveAttribute('href', '/assets/a4');
  });

  it('renders empty states when nothing needs attention', async () => {
    getStaffDashboard.mockResolvedValue({
      ...staffData,
      counts: { pending: 0, awaitingAllocation: 0, returnPending: 0, overdue: 0, openMaintenance: 0, needsMaintenanceRecord: 0 },
      pendingRequests: [],
      overdue: [],
      openMaintenance: [],
      needsMaintenanceRecord: [],
      recentlyAdded: [],
    });
    renderAs(UserRole.ADMIN, <StaffDashboard />, '/staff');
    expect(await screen.findByText('No requests waiting for a decision.')).toBeInTheDocument();
    expect(screen.queryByTestId('needs-record')).not.toBeInTheDocument();
    expect(screen.queryByTestId('request-table')).not.toBeInTheDocument();
    expect(screen.getByText('No unit is under maintenance.')).toBeInTheDocument();
  });
});

describe('EmployeeDashboard', () => {
  it('renders holdings, open requests, pending reviews and recent changes', async () => {
    getEmployeeDashboard.mockResolvedValue(employeeData);
    renderAs(UserRole.EMPLOYEE, <EmployeeDashboard />, '/employee');
    expect(await screen.findByRole('heading', { level: 1, name: 'My dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Assets on loan: 1' })).toHaveAttribute('href', '/employee/assets');
    expect(screen.getByText('1 overdue')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reviews written: 1' })).toHaveAttribute('href', '/employee/requests?view=reviews');
    expect(within(screen.getByTestId('pending-reviews')).getByRole('link', { name: 'Review Dell Latitude' })).toHaveAttribute('href', '/employee/requests/r3');
    expect(screen.getAllByTestId('request-table')).toHaveLength(2);
    expect(within(screen.getByTestId('recent-changes')).getByRole('link', { name: 'Dell Latitude' })).toHaveAttribute('href', '/employee/requests/r3');
    expect(getEmployeeDashboard).toHaveBeenCalledTimes(1);
  });

  it('renders friendly empty states for a brand-new employee', async () => {
    getEmployeeDashboard.mockResolvedValue({
      counts: { activeAssets: 0, pendingRequests: 0, approvedRequests: 0, reviewsSubmitted: 0, availableAssets: 4 },
      activeAssets: [],
      pendingRequests: [],
      recentStatusChanges: [],
      pendingReviews: [],
    });
    renderAs(UserRole.EMPLOYEE, <EmployeeDashboard />, '/employee');
    expect(await screen.findByText(/not holding any assets/)).toBeInTheDocument();
    expect(screen.queryByTestId('pending-reviews')).not.toBeInTheDocument();
    expect(screen.getByText('No requests waiting on IT Staff.')).toBeInTheDocument();
    expect(screen.getByText(/Your request activity will show up here/)).toBeInTheDocument();
  });
});

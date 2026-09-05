import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MaintenanceDetailPage } from './MaintenanceDetailPage';
import { makeAuth, makeUser, renderWithAuth } from '../../test/helpers';
import { AssetCondition, MaintenanceStatus, MaintenanceType, UserRole, type Maintenance } from '../../types';
import * as maintenanceApi from '../../api/maintenance.api';

vi.mock('../../api/maintenance.api');

const getMaintenance = vi.mocked(maintenanceApi.getMaintenance);
const completeMaintenance = vi.mocked(maintenanceApi.completeMaintenance);
const deleteMaintenance = vi.mocked(maintenanceApi.deleteMaintenance);
const updateMaintenance = vi.mocked(maintenanceApi.updateMaintenance);

function record(overrides: Partial<Maintenance> = {}): Maintenance {
  return {
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
    ...overrides,
  };
}

function renderPage() {
  return renderWithAuth(<MaintenanceDetailPage />, {
    auth: makeAuth({ user: makeUser({ id: 's1', role: UserRole.IT_STAFF }) }),
    path: '/staff/maintenance/:id',
    extraRoutes: { '/staff/maintenance': <div>Maintenance list</div> },
  });
}

function actionNames() {
  return within(screen.getByTestId('maintenance-actions'))
    .getAllByRole('button')
    .map((b) => b.textContent);
}

describe('MaintenanceDetailPage', () => {
  it('OPEN record offers Edit, Complete and Cancel record', async () => {
    getMaintenance.mockImplementation(async () => record());
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: /Repair · Dell Latitude/ })).toBeInTheDocument();
    expect(actionNames()).toEqual(['Edit', 'Complete', 'Cancel record']);
    expect(screen.getByText('25.00')).toBeInTheDocument();
  });

  it('COMPLETED record only offers Edit and explains immutability', async () => {
    getMaintenance.mockImplementation(async () => record({ status: MaintenanceStatus.COMPLETED, completedAt: '2026-09-02T10:00:00.000Z', resultingCondition: AssetCondition.FAIR }));
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: /Dell Latitude/ })).toBeInTheDocument();
    expect(actionNames()).toEqual(['Edit']);
    expect(screen.getByText(/immutable except/)).toBeInTheDocument();
    expect(screen.getByText('Resulting condition')).toBeInTheDocument();
  });

  it('complete sends condition, optional cost and retire flag, then reloads', async () => {
    getMaintenance.mockImplementation(async () => record());
    completeMaintenance.mockResolvedValue(record({ status: MaintenanceStatus.COMPLETED }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Complete' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Resulting condition'), AssetCondition.POOR);
    await userEvent.type(within(dialog).getByLabelText(/Final cost/), '40');
    await userEvent.click(within(dialog).getByLabelText(/Retire the unit/));
    expect(dialog).toHaveTextContent('retired permanently');
    getMaintenance.mockImplementation(async () => record({ status: MaintenanceStatus.COMPLETED, resultingCondition: AssetCondition.POOR, cost: 40 }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Complete' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/retired/);
    expect(completeMaintenance).toHaveBeenCalledWith('m1', { resultingCondition: 'POOR', cost: 40, retire: true });
    expect(actionNames()).toEqual(['Edit']);
  });

  it('rejects a negative final cost inside the dialog without calling the API', async () => {
    getMaintenance.mockImplementation(async () => record());
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Complete' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Final cost/), '-5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Complete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/0 or more/);
    expect(completeMaintenance).not.toHaveBeenCalled();
  });

  it('cancel record deletes and returns to the list; API errors stay in the dialog', async () => {
    getMaintenance.mockImplementation(async () => record());
    deleteMaintenance.mockRejectedValueOnce({ status: 409, code: 'RECORD_IMMUTABLE', message: 'Completed maintenance records are immutable' });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel record' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete record' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('immutable');

    deleteMaintenance.mockResolvedValueOnce();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete record' }));
    expect(await screen.findByText('Maintenance list')).toBeInTheDocument();
    expect(deleteMaintenance).toHaveBeenCalledWith('m1');
  });

  it('edit form saves description, type and cost', async () => {
    getMaintenance.mockImplementation(async () => record());
    updateMaintenance.mockResolvedValue(record({ type: MaintenanceType.UPGRADE, cost: null }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('form', { name: 'Edit maintenance record' });
    await userEvent.selectOptions(within(form).getByLabelText('Type'), MaintenanceType.UPGRADE);
    await userEvent.clear(within(form).getByLabelText('Cost'));
    await userEvent.type(within(form).getByLabelText('Description'), ' and RAM upgrade');
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Record updated.');
    expect(updateMaintenance).toHaveBeenCalledWith('m1', { type: 'UPGRADE', description: 'Fan is rattling and RAM upgrade', cost: null });
  });
});

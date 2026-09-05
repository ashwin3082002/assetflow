import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsersPage } from './UsersPage';
import { makeAuth, makeUser, renderWithAuth } from '../../test/helpers';
import { UserRole, type User } from '../../types';
import * as usersApi from '../../api/users.api';

vi.mock('../../api/users.api');

const listUsers = vi.mocked(usersApi.listUsers);
const createUser = vi.mocked(usersApi.createUser);
const updateUser = vi.mocked(usersApi.updateUser);

const me = makeUser({ id: 'admin1', fullName: 'Ada Admin', email: 'admin@assetflow.dev', role: UserRole.ADMIN });
const sam = makeUser({ id: 's1', fullName: 'Sam Staff', email: 'staff1@assetflow.dev', role: UserRole.IT_STAFF, department: 'IT' });
const eli = makeUser({ id: 'e1', fullName: 'Eli Employee', email: 'emp1@assetflow.dev', role: UserRole.EMPLOYEE });

function page(rows: User[]) {
  return { data: rows, meta: { page: 1, limit: 10, total: rows.length, totalPages: 1 } };
}

function renderPage() {
  return renderWithAuth(<UsersPage />, { auth: makeAuth({ user: me }), path: '/admin/users' });
}

describe('UsersPage', () => {
  beforeEach(() => {
    listUsers.mockResolvedValue(page([me, sam, eli]));
  });

  it('lists users and passes filters to the API', async () => {
    renderPage();
    const table = await screen.findByTestId('user-table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('you')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Role'), UserRole.IT_STAFF);
    expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'IT_STAFF', page: '1' }));
  });

  it('creates a user with an explicit role after client validation', async () => {
    createUser.mockResolvedValue(makeUser({ id: 'n1', fullName: 'New Staff', role: UserRole.IT_STAFF }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New user' }));
    const form = screen.getByRole('form', { name: 'Create user' });
    await userEvent.click(within(form).getByRole('button', { name: 'Create user' }));
    expect(within(form).getByText(/at least 2 characters/)).toBeInTheDocument();
    expect(within(form).getByText(/valid email/)).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();

    await userEvent.type(within(form).getByLabelText('Full name'), 'New Staff');
    await userEvent.type(within(form).getByLabelText('Email'), 'New.Staff@Example.com');
    await userEvent.type(within(form).getByLabelText('Temporary password'), 'Password123');
    await userEvent.selectOptions(within(form).getByLabelText('Role'), UserRole.IT_STAFF);
    await userEvent.click(within(form).getByRole('button', { name: 'Create user' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Account created for New Staff (IT Staff)');
    expect(createUser).toHaveBeenCalledWith({ fullName: 'New Staff', email: 'new.staff@example.com', password: 'Password123', role: 'IT_STAFF', department: null });
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it('edit sends only changed fields and surfaces API warnings; own role and status are locked', async () => {
    updateUser.mockResolvedValue({ data: { ...sam, role: UserRole.EMPLOYEE }, warnings: ['manages 3 assets'] });
    renderPage();
    const table = await screen.findByTestId('user-table');
    const rows = within(table).getAllByRole('row');

    // Own row: role select and active switch disabled.
    await userEvent.click(within(rows[1]).getByRole('button', { name: 'Edit' }));
    expect(within(table).getByLabelText('Role')).toBeDisabled();
    expect(within(table).getByRole('checkbox', { name: 'Active' })).toBeDisabled();
    await userEvent.click(within(table).getByRole('button', { name: 'Cancel' }));

    // Sam: change role → warning shown after save.
    await userEvent.click(within(within(table).getAllByRole('row')[2]).getByRole('button', { name: 'Edit' }));
    await userEvent.selectOptions(within(table).getByLabelText('Role'), UserRole.EMPLOYEE);
    expect(screen.getByText(/keep them as manager/)).toBeInTheDocument();
    await userEvent.click(within(table).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('note')).toHaveTextContent('manages 3 assets');
    expect(updateUser).toHaveBeenCalledWith('s1', { role: 'EMPLOYEE' });
  });

  it('deactivating shows a warning hint and sends isActive=false', async () => {
    updateUser.mockResolvedValue({ data: { ...eli, isActive: false } });
    renderPage();
    const table = await screen.findByTestId('user-table');
    await userEvent.click(within(within(table).getAllByRole('row')[3]).getByRole('button', { name: 'Edit' }));
    await userEvent.click(within(table).getByRole('checkbox', { name: 'Active' }));
    expect(screen.getByText(/signed out on their next request/)).toBeInTheDocument();
    await userEvent.click(within(table).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('User updated.');
    expect(updateUser).toHaveBeenCalledWith('e1', { isActive: false });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows ErrorAlert with retry when the list fails', async () => {
    listUsers.mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR', message: 'Boom' });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('user-table')).toBeInTheDocument();
  });
});

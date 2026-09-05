import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { UserRole } from '../../types';
import type { ApiError } from '../../types';
import { makeAuth, makeUser, renderWithAuth } from '../../test/helpers';

const dashboards = {
  '/admin': <div>Admin dashboard</div>,
  '/staff': <div>Staff dashboard</div>,
  '/employee': <div>Employee dashboard</div>,
  '/assets/42': <div>Asset 42</div>,
};

describe('LoginPage', () => {
  it('shows validation messages without calling the API', async () => {
    const login = vi.fn();
    renderWithAuth(<LoginPage />, { auth: makeAuth({ login }), path: '/login', extraRoutes: dashboards });
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows the API error message on failure', async () => {
    const apiError: ApiError = { status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' };
    const login = vi.fn().mockRejectedValue(apiError);
    renderWithAuth(<LoginPage />, { auth: makeAuth({ login }), path: '/login', extraRoutes: dashboards });
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'Wrong1234');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it.each([
    [UserRole.ADMIN, 'Admin dashboard'],
    [UserRole.IT_STAFF, 'Staff dashboard'],
    [UserRole.EMPLOYEE, 'Employee dashboard'],
  ])('navigates a %s to their own dashboard', async (role, text) => {
    const login = vi.fn().mockResolvedValue(makeUser({ role }));
    renderWithAuth(<LoginPage />, { auth: makeAuth({ login }), path: '/login', extraRoutes: dashboards });
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
    expect(login).toHaveBeenCalledWith('a@b.dev', 'Password123');
  });

  it('returns to the page the user came from', async () => {
    const login = vi.fn().mockResolvedValue(makeUser({ role: UserRole.EMPLOYEE }));
    const { unmount } = renderWithAuth(<LoginPage />, { auth: makeAuth({ login }), path: '/login', extraRoutes: dashboards });
    unmount();
    // Re-render with router state carrying `from`.
    const { MemoryRouter, Routes, Route } = await import('react-router-dom');
    const { render } = await import('@testing-library/react');
    const { AuthContext } = await import('../../auth/AuthContext');
    render(
      <AuthContext.Provider value={makeAuth({ login })}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/assets/42' } }]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/assets/42" element={<div>Asset 42</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.dev');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByText('Asset 42')).toBeInTheDocument());
  });
});

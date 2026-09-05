import { screen } from '@testing-library/react';
import { ProtectedRoute } from './ProtectedRoute';
import { UserRole } from '../types';
import { makeAuth, makeUser, renderWithAuth } from '../test/helpers';

const extraRoutes = { '/login': <div>Login page</div>, '/403': <div>Forbidden page</div> };

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to /login', () => {
    renderWithAuth(
      <ProtectedRoute>
        <div>Secret</div>
      </ProtectedRoute>,
      { auth: makeAuth({ user: null }), path: '/staff', extraRoutes },
    );
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('redirects users with the wrong role to /403', () => {
    renderWithAuth(
      <ProtectedRoute roles={[UserRole.ADMIN]}>
        <div>Admin only</div>
      </ProtectedRoute>,
      { auth: makeAuth({ user: makeUser({ role: UserRole.EMPLOYEE }) }), path: '/admin', extraRoutes },
    );
    expect(screen.getByText('Forbidden page')).toBeInTheDocument();
  });

  it('renders children for an allowed role', () => {
    renderWithAuth(
      <ProtectedRoute roles={[UserRole.ADMIN, UserRole.IT_STAFF]}>
        <div>Staff area</div>
      </ProtectedRoute>,
      { auth: makeAuth({ user: makeUser({ role: UserRole.IT_STAFF }) }), path: '/staff', extraRoutes },
    );
    expect(screen.getByText('Staff area')).toBeInTheDocument();
  });

  it('shows a loading gate while the session is being validated', () => {
    renderWithAuth(
      <ProtectedRoute>
        <div>Secret</div>
      </ProtectedRoute>,
      { auth: makeAuth({ user: null, isLoading: true }), path: '/', extraRoutes },
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });
});

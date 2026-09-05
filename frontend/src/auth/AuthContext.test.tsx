import { screen, waitFor } from '@testing-library/react';
import { render } from '@testing-library/react';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';
import { setToken, getToken } from '../api/client';
import * as authApi from '../api/auth.api';
import { makeUser } from '../test/helpers';

vi.mock('../api/auth.api');

function Probe() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  return <div>{user ? `user:${user.email}` : 'anonymous'}</div>;
}

describe('AuthProvider', () => {
  it('validates a stored token via /auth/me on mount', async () => {
    setToken('stored-token');
    vi.mocked(authApi.me).mockResolvedValue(makeUser({ email: 'me@test.dev' }));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('user:me@test.dev')).toBeInTheDocument());
    expect(authApi.me).toHaveBeenCalledTimes(1);
  });

  it('clears an invalid stored token', async () => {
    setToken('expired-token');
    vi.mocked(authApi.me).mockRejectedValue({ status: 401, code: 'UNAUTHENTICATED', message: 'nope' });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
    expect(getToken()).toBeNull();
  });

  it('is anonymous immediately when no token is stored', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('anonymous')).toBeInTheDocument();
    expect(authApi.me).not.toHaveBeenCalled();
  });
});

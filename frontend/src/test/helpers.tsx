import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { User } from '../types';
import { UserRole } from '../types';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    fullName: 'Test User',
    email: 'test@test.dev',
    role: UserRole.EMPLOYEE,
    department: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: null,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

/** Renders `ui` inside a MemoryRouter at `path` with a stubbed AuthContext; extra routes capture redirects. */
export function renderWithAuth(ui: ReactNode, { auth = makeAuth(), path = '/', extraRoutes = {} as Record<string, ReactNode> } = {}) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={ui} />
          {Object.entries(extraRoutes).map(([p, el]) => (
            <Route key={p} path={p} element={el} />
          ))}
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

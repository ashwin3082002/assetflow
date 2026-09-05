import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { Loading } from '../components/common/Loading';
import type { UserRole } from '../types';

interface Props {
  /** When omitted, any authenticated user may pass. */
  roles?: UserRole[];
  children?: ReactNode;
}

/**
 * Client-side gate only: the API enforces authorization independently.
 * Unauthenticated → /login (remembering `from`); wrong role → /403.
 */
export function ProtectedRoute({ roles, children }: Props) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Loading fullPage label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/403" replace />;

  return children ? <>{children}</> : <Outlet />;
}

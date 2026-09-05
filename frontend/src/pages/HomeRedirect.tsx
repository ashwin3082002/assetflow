import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { dashboardPathFor } from '../utils/roles';

/** `/` sends each role to its own landing page. */
export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? dashboardPathFor(user.role) : '/login'} replace />;
}

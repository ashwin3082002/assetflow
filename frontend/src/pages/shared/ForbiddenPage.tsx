import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { dashboardPathFor, ROLE_LABELS } from '../../utils/roles';

export function ForbiddenPage() {
  const { user } = useAuth();
  return (
    <div className="text-center py-5">
      <div className="display-4">403</div>
      <h1 className="h3">You don't have access to this page</h1>
      <p className="text-secondary">Your role ({user ? ROLE_LABELS[user.role] : 'unknown'}) is not allowed to view this area.</p>
      <Link className="btn btn-primary" to={user ? dashboardPathFor(user.role) : '/login'}>
        Go to your dashboard
      </Link>
    </div>
  );
}

import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { UserRole } from '../../types';
import { ROLE_LABELS } from '../../utils/roles';

interface NavItem {
  to: string;
  label: string;
}

/** Navigation is derived from the role; the API still enforces every permission. */
function itemsFor(role: UserRole): NavItem[] {
  const assets = { to: '/assets', label: 'Assets' };
  const queue = { to: '/staff/requests', label: 'Requests' };
  const maintenance = { to: '/staff/maintenance', label: 'Maintenance' };
  switch (role) {
    case UserRole.ADMIN:
      return [
        { to: '/admin', label: 'Admin' },
        { to: '/staff', label: 'Operations' },
        assets,
        queue,
        maintenance,
        { to: '/admin/users', label: 'Users' },
        { to: '/admin/categories', label: 'Categories' },
      ];
    case UserRole.IT_STAFF:
      return [{ to: '/staff', label: 'Dashboard' }, assets, queue, maintenance];
    default:
      return [
        { to: '/employee', label: 'Dashboard' },
        assets,
        { to: '/employee/requests', label: 'My requests' },
        { to: '/employee/assets', label: 'My assets' },
      ];
  }
}

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // Collapse state is held in React because the Bootstrap JS bundle is not loaded.
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const linkClass = ({ isActive }: { isActive: boolean }) => `nav-link ${isActive ? 'active' : ''}`;

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-dark px-3">
      <NavLink to="/" className="navbar-brand fw-semibold">
        AssetFlow
      </NavLink>
      <button
        type="button"
        className="navbar-toggler"
        aria-controls="main-nav"
        aria-expanded={open}
        aria-label="Toggle navigation"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="navbar-toggler-icon" />
      </button>
      <div className={`collapse navbar-collapse ${open ? 'show' : ''}`} id="main-nav">
        <ul className="navbar-nav me-auto">
          {itemsFor(user.role).map((item) => (
            <li className="nav-item" key={item.to}>
              <NavLink to={item.to} className={linkClass} onClick={() => setOpen(false)}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <ul className="navbar-nav align-items-lg-center">
          <li className="nav-item">
            <NavLink to="/profile" className={linkClass} onClick={() => setOpen(false)}>
              {user.fullName} <span className="badge bg-secondary ms-1">{ROLE_LABELS[user.role]}</span>
            </NavLink>
          </li>
          <li className="nav-item py-2 py-lg-0">
            <button type="button" className="btn btn-outline-light btn-sm ms-lg-2" onClick={handleLogout}>
              Log out
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}

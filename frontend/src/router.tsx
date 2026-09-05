import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { useAuth } from './auth/useAuth';
import { AppLayout } from './components/layout/AppLayout';
import { Loading } from './components/common/Loading';
import { UserRole } from './types';
import { dashboardPathFor } from './utils/roles';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { HomeRedirect } from './pages/HomeRedirect';
import { ProfilePage } from './pages/ProfilePage';
import { ForbiddenPage } from './pages/shared/ForbiddenPage';
import { NotFoundPage } from './pages/shared/NotFoundPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { StaffDashboard } from './pages/staff/StaffDashboard';
import { EmployeeDashboard } from './pages/employee/EmployeeDashboard';
import { AssetListPage } from './pages/assets/AssetListPage';
import { AssetDetailPage } from './pages/assets/AssetDetailPage';
import { AssetFormPage } from './pages/assets/AssetFormPage';
import { CategoriesPage } from './pages/admin/CategoriesPage';
import { MyRequestsPage } from './pages/employee/MyRequestsPage';
import { MyAssetsPage } from './pages/employee/MyAssetsPage';
import { RequestQueuePage } from './pages/staff/RequestQueuePage';
import { RequestDetailPage } from './pages/requests/RequestDetailPage';
import { MaintenancePage } from './pages/staff/MaintenancePage';
import { MaintenanceDetailPage } from './pages/staff/MaintenanceDetailPage';
import { UsersPage } from './pages/admin/UsersPage';

/** Login/register are hidden from users who are already signed in. */
function PublicOnly() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Loading fullPage label="Checking your session…" />;
  if (user) return <Navigate to={dashboardPathFor(user.role)} replace />;
  return <Outlet />;
}

/** Route table per docs/architecture.md §4.2. */
export const router = createBrowserRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: '/', element: <HomeRedirect /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/assets', element: <AssetListPage /> },
      { path: '/assets/:id', element: <AssetDetailPage /> },
      { path: '/403', element: <ForbiddenPage /> },
      {
        element: <ProtectedRoute roles={[UserRole.EMPLOYEE]} />,
        children: [
          { path: '/employee', element: <EmployeeDashboard /> },
          { path: '/employee/requests', element: <MyRequestsPage /> },
          { path: '/employee/requests/:id', element: <RequestDetailPage /> },
          { path: '/employee/assets', element: <MyAssetsPage /> },
        ],
      },
      {
        element: <ProtectedRoute roles={[UserRole.ADMIN, UserRole.IT_STAFF]} />,
        children: [
          { path: '/staff', element: <StaffDashboard /> },
          { path: '/staff/requests', element: <RequestQueuePage /> },
          { path: '/staff/requests/:id', element: <RequestDetailPage /> },
          { path: '/staff/maintenance', element: <MaintenancePage /> },
          { path: '/staff/maintenance/:id', element: <MaintenanceDetailPage /> },
          { path: '/assets/new', element: <AssetFormPage /> },
          { path: '/assets/:id/edit', element: <AssetFormPage /> },
        ],
      },
      {
        element: <ProtectedRoute roles={[UserRole.ADMIN]} />,
        children: [
          { path: '/admin', element: <AdminDashboard /> },
          { path: '/admin/users', element: <UsersPage /> },
          { path: '/admin/categories', element: <CategoriesPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

export function AppLayout() {
  return (
    <div className="min-vh-100 bg-body-tertiary">
      <Navbar />
      <main className="container py-4">
        <Outlet />
      </main>
    </div>
  );
}

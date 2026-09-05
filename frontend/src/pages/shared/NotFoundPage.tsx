import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="text-center py-5">
      <div className="display-4">404</div>
      <h1 className="h3">Page not found</h1>
      <p className="text-secondary">The page you are looking for does not exist.</p>
      <Link className="btn btn-primary" to="/">
        Back to home
      </Link>
    </div>
  );
}

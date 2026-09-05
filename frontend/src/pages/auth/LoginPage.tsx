import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { FormField, fieldErrorsFrom } from '../../components/common/FormField';
import { dashboardPathFor } from '../../utils/roles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = 'Email is required';
    else if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address';
    if (!password) errors.password = 'Password is required';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setPending(true);
    try {
      const user = await login(email.trim(), password);
      navigate(from && from !== '/login' ? from : dashboardPathFor(user.role), { replace: true });
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(err);
      setPending(false);
    }
  };

  return (
    <div className="container py-5" style={{ maxWidth: 440 }}>
      <h1 className="h3 mb-1">Sign in to AssetFlow</h1>
      <p className="text-secondary mb-4">Use your organisation account.</p>
      <ErrorAlert error={error} />
      <form onSubmit={onSubmit} noValidate>
        <FormField id="email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} />
        <FormField id="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} />
        <button type="submit" className="btn btn-primary w-100" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-3 mb-0 text-center">
        New employee? <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}

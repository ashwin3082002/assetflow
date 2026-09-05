import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { FormField, fieldErrorsFrom } from '../../components/common/FormField';
import { dashboardPathFor } from '../../utils/roles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors backend registerSchema (docs/business-rules.md §3.1). Server validation remains authoritative. */
function validate(values: { fullName: string; email: string; password: string; confirm: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (values.fullName.trim().length < 2) errors.fullName = 'Full name must be at least 2 characters';
  if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter a valid email address';
  if (values.password.length < 8 || !/[A-Za-z]/.test(values.password) || !/\d/.test(values.password)) {
    errors.password = 'At least 8 characters with a letter and a digit';
  }
  if (values.confirm !== values.password) errors.confirm = 'Passwords do not match';
  return errors;
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ fullName: '', email: '', password: '', confirm: '', department: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setPending(true);
    try {
      const user = await register({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password,
        department: values.department.trim() || undefined,
      });
      navigate(dashboardPathFor(user.role), { replace: true });
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(err);
      setPending(false);
    }
  };

  return (
    <div className="container py-5" style={{ maxWidth: 480 }}>
      <h1 className="h3 mb-1">Create your account</h1>
      <p className="text-secondary mb-4">Employee accounts can browse and request assets. IT Staff accounts are created by an administrator.</p>
      <ErrorAlert error={error} />
      <form onSubmit={onSubmit} noValidate>
        <FormField id="fullName" label="Full name" autoComplete="name" value={values.fullName} onChange={set('fullName')} error={fieldErrors.fullName} />
        <FormField id="email" label="Email" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={fieldErrors.email} />
        <FormField id="department" label="Department (optional)" value={values.department} onChange={set('department')} error={fieldErrors.department} />
        <FormField id="password" label="Password" type="password" autoComplete="new-password" value={values.password} onChange={set('password')} error={fieldErrors.password} hint="At least 8 characters with a letter and a digit." />
        <FormField id="confirm" label="Confirm password" type="password" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} error={fieldErrors.confirm} />
        <button type="submit" className="btn btn-primary w-100" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-3 mb-0 text-center">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}

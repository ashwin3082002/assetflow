import { useState, type FormEvent } from 'react';
import * as authApi from '../api/auth.api';
import { useAuth } from '../auth/useAuth';
import { ErrorAlert } from '../components/common/ErrorAlert';
import { FormField, fieldErrorsFrom } from '../components/common/FormField';
import { StatusBadge } from '../components/common/StatusBadge';
import { formatDate } from '../utils/format';

export function ProfilePage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  if (!user) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const errors: Record<string, string> = {};
    if (!current) errors.currentPassword = 'Enter your current password';
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) errors.newPassword = 'At least 8 characters with a letter and a digit';
    if (confirm !== next) errors.confirm = 'Passwords do not match';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setPending(true);
    try {
      await authApi.changePassword(current, next);
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setFieldErrors(fieldErrorsFrom(err));
      setError(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <h1 className="h3 mb-3">Profile</h1>
      <div className="row g-4">
      <div className="col-md-5">
        <div className="card">
          <div className="card-body">
            <h2 className="h5 card-title">Your profile</h2>
            <dl className="row mb-0">
              <dt className="col-5">Name</dt>
              <dd className="col-7">{user.fullName}</dd>
              <dt className="col-5">Email</dt>
              <dd className="col-7">{user.email}</dd>
              <dt className="col-5">Role</dt>
              <dd className="col-7">
                <StatusBadge value={user.role} />
              </dd>
              <dt className="col-5">Department</dt>
              <dd className="col-7">{user.department ?? '—'}</dd>
              <dt className="col-5">Member since</dt>
              <dd className="col-7">{formatDate(user.createdAt)}</dd>
            </dl>
          </div>
        </div>
      </div>
      <div className="col-md-7">
        <div className="card">
          <div className="card-body">
            <h2 className="h5 card-title">Change password</h2>
            <ErrorAlert error={error} />
            {success && (
              <div className="alert alert-success" role="status">
                Password updated.
              </div>
            )}
            <form onSubmit={onSubmit} noValidate>
              <FormField id="currentPassword" label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={fieldErrors.currentPassword} />
              <FormField id="newPassword" label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={fieldErrors.newPassword} />
              <FormField id="confirm" label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fieldErrors.confirm} />
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? 'Saving…' : 'Update password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

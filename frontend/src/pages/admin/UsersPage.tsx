import { useState, type FormEvent } from 'react';
import { createUser, listUsers, updateUser } from '../../api/users.api';
import { useAuth } from '../../auth/useAuth';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { FormField, SelectField, fieldErrorsFrom } from '../../components/common/FormField';
import { Loading } from '../../components/common/Loading';
import { Pagination } from '../../components/common/Pagination';
import { StatusBadge } from '../../components/common/StatusBadge';
import { usePaginatedQuery } from '../../hooks/usePaginatedQuery';
import { UserRole, type User } from '../../types';
import { formatDate } from '../../utils/format';
import { ROLE_LABELS } from '../../utils/roles';

const DEFAULT_FILTERS = { role: '', isActive: '', search: '', sort: 'createdAt', order: 'desc' };

/** Admin user management (business-rules §3.3): list/filter, create with an explicit role, edit role/department/active. */
export function UsersPage() {
  const { user: me } = useAuth();
  const query = usePaginatedQuery<User>(listUsers, DEFAULT_FILTERS);
  const [search, setSearch] = useState(query.filters.search);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    query.setFilter('search', search.trim());
  };

  const afterSave = (message: string, extraWarnings: string[] = []) => {
    setEditingId(null);
    setNotice(message);
    setWarnings(extraWarnings);
    query.reload();
  };

  let content;
  if (query.isLoading) content = <Loading label="Loading users…" />;
  else if (query.error) content = <ErrorAlert error={query.error} onRetry={query.reload} />;
  else if (!query.data || query.data.length === 0)
    content = (
      <EmptyState
        title="No users found"
        message={query.hasActiveFilters ? 'No users match these filters.' : 'Create the first account with the form above.'}
        icon="👥"
        action={
          query.hasActiveFilters ? (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={query.clearFilters}>
              Clear filters
            </button>
          ) : undefined
        }
      />
    );
  else
    content = (
      <>
        <div className="table-responsive">
          <table className="table table-hover align-middle" data-testid="user-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Department</th>
                <th scope="col">Status</th>
                <th scope="col">Joined</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((u) =>
                editingId === u.id ? (
                  <EditRow key={u.id} user={u} isSelf={u.id === me?.id} onCancel={() => setEditingId(null)} onSaved={(w) => afterSave('User updated.', w)} />
                ) : (
                  <tr key={u.id} className={u.isActive ? '' : 'table-secondary'}>
                    <td className="fw-semibold">
                      {u.fullName}
                      {u.id === me?.id && <span className="badge bg-light text-dark ms-2">you</span>}
                    </td>
                    <td className="text-secondary">{u.email}</td>
                    <td>
                      <StatusBadge value={u.role} />
                    </td>
                    <td>{u.department ?? '—'}</td>
                    <td>{u.isActive ? <span className="badge bg-success">Active</span> : <span className="badge bg-secondary">Inactive</span>}</td>
                    <td className="text-nowrap">{formatDate(u.createdAt)}</td>
                    <td className="text-end">
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditingId(u.id)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        {query.meta && <Pagination meta={query.meta} onPageChange={query.setPage} />}
      </>
    );

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h3 mb-0">Users</h1>
          {query.meta && !query.isLoading && <small className="text-secondary">{query.meta.total} user(s)</small>}
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-end">
          <form className="d-flex flex-wrap gap-2 align-items-end" onSubmit={submitSearch} role="search" aria-label="User search">
            <div>
              <label htmlFor="f-role" className="form-label small mb-1">
                Role
              </label>
              <select id="f-role" className="form-select form-select-sm" value={query.filters.role} onChange={(e) => query.setFilter('role', e.target.value)}>
                <option value="">All roles</option>
                {Object.values(UserRole).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-active" className="form-label small mb-1">
                Status
              </label>
              <select id="f-active" className="form-select form-select-sm" value={query.filters.isActive} onChange={(e) => query.setFilter('isActive', e.target.value)}>
                <option value="">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div className="input-group input-group-sm" style={{ maxWidth: 280 }}>
              <input id="f-search" className="form-control" placeholder="Name or email" aria-label="Keyword" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button type="submit" className="btn btn-outline-primary">
                Search
              </button>
            </div>
          </form>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowCreate((v) => !v)} aria-expanded={showCreate}>
            {showCreate ? 'Close form' : 'New user'}
          </button>
        </div>
      </div>

      {showCreate && (
        <CreateForm
          onCreated={(u) => {
            setShowCreate(false);
            afterSave(`Account created for ${u.fullName} (${ROLE_LABELS[u.role]}).`);
          }}
        />
      )}

      {notice && (
        <div className="alert alert-success py-2" role="status">
          {notice}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="alert alert-warning py-2" role="note">
          <strong>Heads up:</strong> this user {warnings.join('; ')}. Reassign those assets to another IT Staff member from each asset's edit page.
        </div>
      )}

      {content}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (user: User) => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.EMPLOYEE);
  const [department, setDepartment] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: Record<string, string> = {};
    if (fullName.trim().length < 2) errors.fullName = 'Full name must be at least 2 characters';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address';
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Password needs at least 8 characters with a letter and a digit';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      const created = await createUser({ fullName: fullName.trim(), email: email.trim().toLowerCase(), password, role, department: department.trim() || null });
      onCreated(created);
    } catch (err) {
      setError(err);
      setFieldErrors(fieldErrorsFrom(err));
      setPending(false);
    }
  };

  return (
    <form className="card card-body mb-3" onSubmit={submit} noValidate aria-label="Create user">
      <h2 className="h6">New user</h2>
      <p className="small text-secondary">Only admins can create IT Staff and Admin accounts; public registration always creates employees.</p>
      <ErrorAlert error={error} />
      <div className="row">
        <div className="col-md-6">
          <FormField id="nu-name" label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={fieldErrors.fullName} maxLength={100} required />
        </div>
        <div className="col-md-6">
          <FormField id="nu-email" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} required />
        </div>
        <div className="col-md-4">
          <FormField id="nu-password" label="Temporary password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} hint="At least 8 characters with a letter and a digit. The user can change it from their profile." required />
        </div>
        <div className="col-md-4">
          <SelectField id="nu-role" label="Role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} error={fieldErrors.role}>
            {Object.values(UserRole).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="col-md-4">
          <FormField id="nu-department" label="Department (optional)" value={department} onChange={(e) => setDepartment(e.target.value)} error={fieldErrors.department} maxLength={100} />
        </div>
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Creating…' : 'Create user'}
        </button>
      </div>
    </form>
  );
}

function EditRow({ user, isSelf, onCancel, onSaved }: { user: User; isSelf: boolean; onCancel: () => void; onSaved: (warnings: string[]) => void }) {
  const [fullName, setFullName] = useState(user.fullName);
  const [department, setDepartment] = useState(user.department ?? '');
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const save = async () => {
    setError(null);
    setPending(true);
    try {
      const result = await updateUser(user.id, {
        ...(fullName.trim() !== user.fullName ? { fullName: fullName.trim() } : {}),
        ...((department.trim() || null) !== user.department ? { department: department.trim() || null } : {}),
        ...(role !== user.role ? { role } : {}),
        ...(isActive !== user.isActive ? { isActive } : {}),
      });
      onSaved(result.warnings ?? []);
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  const unchanged = fullName.trim() === user.fullName && (department.trim() || null) === user.department && role === user.role && isActive === user.isActive;
  const fieldErrors = fieldErrorsFrom(error);

  return (
    <tr>
      <td>
        <input className={`form-control form-control-sm ${fieldErrors.fullName ? 'is-invalid' : ''}`} aria-invalid={!!fieldErrors.fullName} aria-label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
        {!!error && <ErrorAlert error={error} className="py-1 mt-1 mb-0 small" />}
      </td>
      <td className="text-secondary small">{user.email}</td>
      <td>
        <select className="form-select form-select-sm" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isSelf} title={isSelf ? 'You cannot change your own role' : undefined}>
          {Object.values(UserRole).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {user.role === UserRole.IT_STAFF && role !== UserRole.IT_STAFF && <div className="form-text text-warning">Assets they manage keep them as manager until reassigned.</div>}
      </td>
      <td>
        <input className={`form-control form-control-sm ${fieldErrors.department ? 'is-invalid' : ''}`} aria-invalid={!!fieldErrors.department} aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={100} />
      </td>
      <td>
        <div className="form-check form-switch">
          <input id={`active-${user.id}`} type="checkbox" className="form-check-input" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={isSelf} title={isSelf ? 'You cannot deactivate your own account' : undefined} />
          <label htmlFor={`active-${user.id}`} className="form-check-label small">
            {isActive ? 'Active' : 'Inactive'}
          </label>
        </div>
        {!isActive && user.isActive && <div className="form-text text-warning">They will be signed out on their next request. Their assets and requests are untouched.</div>}
      </td>
      <td className="text-nowrap small">{formatDate(user.createdAt)}</td>
      <td className="text-end text-nowrap">
        <button type="button" className="btn btn-sm btn-primary me-1" onClick={save} disabled={pending || unchanged || fullName.trim().length < 2}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

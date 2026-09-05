import { useState, type FormEvent } from 'react';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../../api/categories.api';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { FormField, fieldErrorsFrom } from '../../components/common/FormField';
import { Loading } from '../../components/common/Loading';
import { useApi } from '../../hooks/useApi';
import type { Category } from '../../types';

export function CategoriesPage() {
  const categories = useApi(listCategories, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  let content;
  if (categories.isLoading) content = <Loading label="Loading categories…" />;
  else if (categories.error) content = <ErrorAlert error={categories.error} onRetry={categories.reload} />;
  else if (!categories.data || categories.data.length === 0) content = <EmptyState title="No categories yet" message="Create the first category using the form above." />;
  else
    content = (
      <div className="table-responsive">
        <table className="table align-middle">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Description</th>
              <th scope="col" className="text-end">
                Assets
              </th>
              <th scope="col" className="text-end">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.data.map((c) =>
              editingId === c.id ? (
                <EditRow
                  key={c.id}
                  category={c}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null);
                    setNotice('Category updated.');
                    categories.reload();
                  }}
                />
              ) : (
                <tr key={c.id}>
                  <td className="fw-semibold">{c.name}</td>
                  <td className="text-secondary">{c.description ?? '—'}</td>
                  <td className="text-end">{c.assetCount}</td>
                  <td className="text-end text-nowrap">
                    <button type="button" className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditingId(c.id)}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setDeleting(c)} disabled={c.assetCount > 0} title={c.assetCount > 0 ? 'Categories in use cannot be deleted' : undefined}>
                      Delete
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    );

  return (
    <div>
      <h1 className="h3 mb-3">Categories</h1>
      <CreateForm
        onCreated={() => {
          setNotice('Category created.');
          categories.reload();
        }}
      />
      {notice && (
        <div className="alert alert-success py-2" role="status">
          {notice}
        </div>
      )}
      {content}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete category?"
        body={
          <p className="mb-0">
            <strong>{deleting?.name}</strong> will be removed. This fails if any asset still uses it.
          </p>
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteCategory(deleting.id);
          setDeleting(null);
          setNotice('Category deleted.');
          categories.reload();
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setFieldErrors({ name: 'Name must be at least 2 characters' });
      return;
    }
    setFieldErrors({});
    setPending(true);
    try {
      await createCategory({ name: name.trim(), description: description.trim() || null });
      setName('');
      setDescription('');
      onCreated();
    } catch (err) {
      setError(err);
      setFieldErrors(fieldErrorsFrom(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="card card-body mb-3" onSubmit={submit} noValidate aria-label="Create category">
      <h2 className="h6">New category</h2>
      <ErrorAlert error={error} />
      <div className="row g-2 align-items-start">
        <div className="col-md-4">
          <FormField id="new-name" label="New category" value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} maxLength={60} placeholder="e.g. Tablet" />
        </div>
        <div className="col-md-6">
          <FormField id="new-description" label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} error={fieldErrors.description} maxLength={500} />
        </div>
        <div className="col-md-2 pt-md-4">
          <button type="submit" className="btn btn-primary w-100 mt-md-2" disabled={pending}>
            {pending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </form>
  );
}

function EditRow({ category, onCancel, onSaved }: { category: Category; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? '');
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const save = async () => {
    setError(null);
    setPending(true);
    try {
      await updateCategory(category.id, { name: name.trim(), description: description.trim() || null });
      onSaved();
    } catch (err) {
      setError(err);
      setPending(false);
    }
  };

  const fieldErrors = fieldErrorsFrom(error);

  return (
    <tr>
      <td>
        <input className={`form-control form-control-sm ${fieldErrors.name ? 'is-invalid' : ''}`} aria-invalid={!!fieldErrors.name} aria-label="Category name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        {!!error && <ErrorAlert error={error} className="py-1 mt-1 mb-0 small" />}
      </td>
      <td>
        <input className={`form-control form-control-sm ${fieldErrors.description ? 'is-invalid' : ''}`} aria-invalid={!!fieldErrors.description} aria-label="Category description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
      </td>
      <td className="text-end">{category.assetCount}</td>
      <td className="text-end text-nowrap">
        <button type="button" className="btn btn-sm btn-primary me-1" onClick={save} disabled={pending || name.trim().length < 2}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

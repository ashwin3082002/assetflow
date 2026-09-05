import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createAsset, getAsset, updateAsset, type AssetInput } from '../../api/assets.api';
import { listCategories } from '../../api/categories.api';
import { listManagers } from '../../api/users.api';
import { useAuth } from '../../auth/useAuth';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { FormField, SelectField, TextAreaField, fieldErrorsFrom } from '../../components/common/FormField';
import { Loading } from '../../components/common/Loading';
import { useApi } from '../../hooks/useApi';
import { AssetCondition, UserRole, type Asset, type Category, type User } from '../../types';
import { humanize } from '../../utils/format';
import { todayISO } from '../../utils/dates';

interface FormValues {
  name: string;
  description: string;
  serialNumber: string;
  categoryId: string;
  managedById: string;
  condition: AssetCondition;
  purchaseDate: string;
  maxLoanDays: string;
  location: string;
}

function valuesFrom(asset: Asset | undefined, selfId: string | undefined): FormValues {
  return {
    name: asset?.name ?? '',
    description: asset?.description ?? '',
    serialNumber: asset?.serialNumber ?? '',
    categoryId: asset?.category.id ?? '',
    managedById: asset?.managedBy.id ?? selfId ?? '',
    condition: asset?.condition ?? AssetCondition.GOOD,
    purchaseDate: asset?.purchaseDate ?? '',
    maxLoanDays: asset?.maxLoanDays?.toString() ?? '',
    location: asset?.location ?? '',
  };
}

function toInput(v: FormValues): AssetInput {
  return {
    name: v.name.trim(),
    description: v.description.trim(),
    serialNumber: v.serialNumber.trim(),
    categoryId: v.categoryId,
    managedById: v.managedById || undefined,
    condition: v.condition,
    purchaseDate: v.purchaseDate || null,
    maxLoanDays: v.maxLoanDays === '' ? null : Number(v.maxLoanDays),
    location: v.location.trim() || null,
  };
}

function clientValidate(v: FormValues, adminMustPickManager: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (v.name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
  if (!v.description.trim()) errors.description = 'Description is required';
  if (v.serialNumber.trim().length < 3) errors.serialNumber = 'Serial number must be at least 3 characters';
  if (!v.categoryId) errors.categoryId = 'Choose a category';
  if (adminMustPickManager && !v.managedById) errors.managedById = 'Choose the IT Staff member who manages this asset';
  if (v.maxLoanDays !== '') {
    const n = Number(v.maxLoanDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) errors.maxLoanDays = 'Must be a whole number between 1 and 365';
  }
  if (v.purchaseDate && v.purchaseDate > todayISO()) errors.purchaseDate = 'Purchase date cannot be in the future';
  return errors;
}

export function AssetFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user } = useAuth();

  const existing = useApi(() => (id ? getAsset(id) : Promise.resolve(undefined)), [id]);
  const categories = useApi(listCategories, []);
  const managers = useApi(listManagers, []);

  if (existing.isLoading || categories.isLoading || managers.isLoading) return <Loading label="Loading form…" />;
  const loadError = existing.error ?? categories.error ?? managers.error;
  if (loadError) {
    return (
      <ErrorAlert
        error={loadError}
        onRetry={() => {
          existing.reload();
          categories.reload();
          managers.reload();
        }}
      />
    );
  }
  if (isEdit && !existing.data) return <ErrorAlert error="Asset not found" onRetry={existing.reload} />;

  return (
    <AssetForm
      key={existing.data?.id ?? 'new'}
      asset={existing.data}
      categories={categories.data ?? []}
      managers={managers.data ?? []}
      isAdmin={user?.role === UserRole.ADMIN}
      selfId={user?.role === UserRole.IT_STAFF ? user.id : undefined}
      onSaved={(saved) => navigate(`/assets/${saved.id}`, { replace: true })}
    />
  );
}

interface FormProps {
  asset: Asset | undefined;
  categories: Category[];
  managers: User[];
  isAdmin: boolean;
  selfId: string | undefined;
  onSaved: (asset: Asset) => void;
}

function AssetForm({ asset, categories, managers, isAdmin, selfId, onSaved }: FormProps) {
  const [values, setValues] = useState<FormValues>(() => valuesFrom(asset, selfId));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const set = (key: keyof FormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors = clientValidate(values, isAdmin);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setPending(true);
    try {
      const saved = asset ? await updateAsset(asset.id, toInput(values)) : await createAsset(toInput(values));
      onSaved(saved);
    } catch (err) {
      setError(err);
      setFieldErrors(fieldErrorsFrom(err));
      setPending(false);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item">
            <Link to="/assets">Assets</Link>
          </li>
          {asset && (
            <li className="breadcrumb-item">
              <Link to={`/assets/${asset.id}`}>{asset.name}</Link>
            </li>
          )}
          <li className="breadcrumb-item active" aria-current="page">
            {asset ? 'Edit' : 'New asset'}
          </li>
        </ol>
      </nav>
      <h1 className="h3 mb-3">{asset ? `Edit ${asset.name}` : 'Add asset'}</h1>
      <ErrorAlert error={error} />
      <form onSubmit={onSubmit} noValidate>
        <FormField id="name" label="Name" value={values.name} onChange={set('name')} error={fieldErrors.name} maxLength={120} required />
        <TextAreaField id="description" label="Description" rows={4} value={values.description} onChange={set('description')} error={fieldErrors.description} maxLength={2000} required />
        <div className="row">
          <div className="col-md-6">
            <FormField id="serialNumber" label="Serial number" value={values.serialNumber} onChange={set('serialNumber')} error={fieldErrors.serialNumber} maxLength={100} required hint="Must be unique across all units" />
          </div>
          <div className="col-md-6">
            <SelectField id="categoryId" label="Category" value={values.categoryId} onChange={set('categoryId')} error={fieldErrors.categoryId} required>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        <div className="row">
          <div className="col-md-6">
            <SelectField id="managedById" label="Managed by (IT Staff)" value={values.managedById} onChange={set('managedById')} error={fieldErrors.managedById} required={isAdmin} hint={isAdmin ? undefined : 'Defaults to you'}>
              <option value="">{isAdmin ? 'Choose…' : 'Me'}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="col-md-6">
            <SelectField id="condition" label="Condition" value={values.condition} onChange={set('condition')} error={fieldErrors.condition}>
              {Object.values(AssetCondition).map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
        <div className="row">
          <div className="col-md-4">
            <FormField id="purchaseDate" label="Purchase date" type="date" value={values.purchaseDate} onChange={set('purchaseDate')} error={fieldErrors.purchaseDate} />
          </div>
          <div className="col-md-4">
            <FormField id="maxLoanDays" label="Max loan days" type="number" min={1} max={365} value={values.maxLoanDays} onChange={set('maxLoanDays')} error={fieldErrors.maxLoanDays} hint="Leave empty for no limit" />
          </div>
          <div className="col-md-4">
            <FormField id="location" label="Location" value={values.location} onChange={set('location')} error={fieldErrors.location} maxLength={100} />
          </div>
        </div>
        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'Saving…' : asset ? 'Save changes' : 'Create asset'}
          </button>
          <Link to={asset ? `/assets/${asset.id}` : '/assets'} className="btn btn-outline-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

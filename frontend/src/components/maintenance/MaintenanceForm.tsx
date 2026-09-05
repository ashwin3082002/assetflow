import { useState, type FormEvent } from 'react';
import { openMaintenance } from '../../api/maintenance.api';
import { MaintenanceType, type Asset, type Maintenance } from '../../types';
import { humanize } from '../../utils/format';
import { ErrorAlert } from '../common/ErrorAlert';
import { FormField, SelectField, TextAreaField, fieldErrorsFrom } from '../common/FormField';

interface Props {
  asset: Pick<Asset, 'id' | 'name' | 'serialNumber' | 'status'>;
  onCreated: (record: Maintenance) => void;
  onCancel: () => void;
}

const COST_MAX = 99_999_999.99;

/** Parses an optional cost field: '' → null, invalid/negative → error message. */
export function parseCost(raw: string): { value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return { value: null, error: 'Cost must be a number of 0 or more' };
  if (value > COST_MAX) return { value: null, error: 'Cost is too large' };
  return { value: Math.round(value * 100) / 100 };
}

/** Staff form that opens a maintenance record (business-rules §3.12); the unit goes UNDER_MAINTENANCE. */
export function MaintenanceForm({ asset, onCreated, onCancel }: Props) {
  const [type, setType] = useState<MaintenanceType>(MaintenanceType.REPAIR);
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: Record<string, string> = {};
    if (description.trim().length < 5) errors.description = 'Describe the work in at least 5 characters';
    else if (description.trim().length > 2000) errors.description = 'Description must be at most 2000 characters';
    const parsedCost = parseCost(cost);
    if (parsedCost.error) errors.cost = parsedCost.error;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      const created = await openMaintenance({ assetId: asset.id, type, description: description.trim(), cost: parsedCost.value });
      onCreated(created);
    } catch (err) {
      setError(err);
      setFieldErrors(fieldErrorsFrom(err));
      setPending(false);
    }
  };

  return (
    <form className="card card-body mb-3" onSubmit={submit} noValidate aria-label="Open maintenance">
      <h2 className="h6">Open maintenance</h2>
      <p className="small text-secondary">
        <strong>{asset.name}</strong> ({asset.serialNumber}) will be marked under maintenance and cannot be requested until the record is completed.
      </p>
      <ErrorAlert error={error} />
      <div className="row">
        <div className="col-md-6">
          <SelectField id="mt-type" label="Type" value={type} onChange={(e) => setType(e.target.value as MaintenanceType)} error={fieldErrors.type}>
            {Object.values(MaintenanceType).map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="col-md-6">
          <FormField id="mt-cost" label="Estimated cost (optional)" type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} error={fieldErrors.cost} placeholder="0.00" />
        </div>
      </div>
      <TextAreaField id="mt-description" label="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} error={fieldErrors.description} hint="What needs doing (5–2000 characters)." maxLength={2000} required />
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-warning" disabled={pending}>
          {pending ? 'Opening…' : 'Open maintenance'}
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

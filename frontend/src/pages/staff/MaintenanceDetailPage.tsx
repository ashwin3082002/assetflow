import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { completeMaintenance, deleteMaintenance, getMaintenance, updateMaintenance } from '../../api/maintenance.api';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ErrorAlert } from '../../components/common/ErrorAlert';
import { FormField, SelectField, TextAreaField, fieldErrorsFrom } from '../../components/common/FormField';
import { Loading } from '../../components/common/Loading';
import { StatusBadge } from '../../components/common/StatusBadge';
import { parseCost } from '../../components/maintenance/MaintenanceForm';
import { useApi } from '../../hooks/useApi';
import { AssetCondition, MaintenanceStatus, MaintenanceType, type Maintenance } from '../../types';
import { formatCost, formatDateTime, humanize } from '../../utils/format';

type Dialog = 'complete' | 'delete' | null;

/** Converts a `datetime-local` value to ISO-8601 (or undefined when blank → server uses "now"). */
function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Staff view of one maintenance record with Edit / Complete / Cancel (business-rules §3.13–3.14). */
export function MaintenanceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const record = useApi(() => getMaintenance(id), [id]);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [condition, setCondition] = useState<AssetCondition>(AssetCondition.GOOD);
  const [finalCost, setFinalCost] = useState('');
  const [completedAt, setCompletedAt] = useState('');
  const [retire, setRetire] = useState(false);

  if (record.isLoading) return <Loading label="Loading maintenance record…" />;
  if (record.error || !record.data) return <ErrorAlert error={record.error ?? 'Maintenance record not found'} onRetry={record.reload} />;
  const m: Maintenance = record.data;
  const open = m.status === MaintenanceStatus.OPEN;

  const closeDialog = () => {
    setDialog(null);
    setCondition(AssetCondition.GOOD);
    setFinalCost('');
    setCompletedAt('');
    setRetire(false);
  };

  const complete = async () => {
    const parsed = parseCost(finalCost);
    if (parsed.error) throw new Error(parsed.error);
    const iso = toIso(completedAt);
    if (completedAt && !iso) throw new Error('Completion time is not a valid date');
    if (iso && new Date(iso) > new Date()) throw new Error('Completion time cannot be in the future');
    await completeMaintenance(m.id, {
      resultingCondition: condition,
      ...(finalCost.trim() !== '' ? { cost: parsed.value } : {}),
      ...(iso ? { completedAt: iso } : {}),
      retire,
    });
    closeDialog();
    setNotice(retire ? 'Maintenance completed and the unit was retired.' : `Maintenance completed. The unit is available again in ${humanize(condition).toLowerCase()} condition.`);
    record.reload();
  };

  const remove = async () => {
    await deleteMaintenance(m.id);
    navigate('/staff/maintenance', { replace: true });
  };

  return (
    <div>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item">
            <Link to="/staff/maintenance">Maintenance</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {m.asset.name}
          </li>
        </ol>
      </nav>

      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">
            {humanize(m.type)} · {m.asset.name} <StatusBadge value={m.status} className="align-middle fs-6" />
          </h1>
          <div className="text-secondary small">
            <Link to={`/assets/${m.asset.id}`}>{m.asset.serialNumber}</Link> · opened {formatDateTime(m.startedAt)} by {m.createdBy.fullName}
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2" data-testid="maintenance-actions">
          <button type="button" className="btn btn-outline-primary" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            Edit
          </button>
          {open && (
            <>
              <button type="button" className="btn btn-success" onClick={() => setDialog('complete')}>
                Complete
              </button>
              <button type="button" className="btn btn-outline-danger" onClick={() => setDialog('delete')}>
                Cancel record
              </button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div className="alert alert-success py-2" role="status">
          {notice}
        </div>
      )}
      {!open && <p className="text-secondary small">Completed records are immutable except for their description, type and cost.</p>}

      {editing && (
        <EditForm
          record={m}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice('Record updated.');
            record.reload();
          }}
        />
      )}

      <div className="card mb-3">
        <div className="card-body">
          <dl className="row mb-0">
            <dt className="col-sm-3">Asset</dt>
            <dd className="col-sm-9">
              <Link to={`/assets/${m.asset.id}`}>{m.asset.name}</Link> <span className="text-secondary font-monospace small">{m.asset.serialNumber}</span>
            </dd>
            <dt className="col-sm-3">Type</dt>
            <dd className="col-sm-9">{humanize(m.type)}</dd>
            <dt className="col-sm-3">Description</dt>
            <dd className="col-sm-9" style={{ whiteSpace: 'pre-wrap' }}>
              {m.description}
            </dd>
            <dt className="col-sm-3">Cost</dt>
            <dd className="col-sm-9">{formatCost(m.cost)}</dd>
            <dt className="col-sm-3">Started</dt>
            <dd className="col-sm-9">{formatDateTime(m.startedAt)}</dd>
            <dt className="col-sm-3">Completed</dt>
            <dd className="col-sm-9">{formatDateTime(m.completedAt)}</dd>
            {m.resultingCondition && (
              <>
                <dt className="col-sm-3">Resulting condition</dt>
                <dd className="col-sm-9">
                  <StatusBadge value={m.resultingCondition} />
                </dd>
              </>
            )}
            <dt className="col-sm-3">Opened by</dt>
            <dd className="col-sm-9">{m.createdBy.fullName}</dd>
          </dl>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'complete'}
        title="Complete maintenance?"
        body={
          <>
            <SelectField id="mt-condition" label="Resulting condition" value={condition} onChange={(e) => setCondition(e.target.value as AssetCondition)} hint="The asset takes this condition.">
              {Object.values(AssetCondition).map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </SelectField>
            <FormField id="mt-final-cost" label="Final cost (optional)" type="number" min={0} step="0.01" value={finalCost} onChange={(e) => setFinalCost(e.target.value)} placeholder={m.cost === null ? '0.00' : formatCost(m.cost)} hint="Leave blank to keep the current cost." />
            <FormField id="mt-completed-at" label="Completed at (optional)" type="datetime-local" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} hint="Defaults to now. Cannot be before the record was opened." />
            <div className="form-check">
              <input id="mt-retire" type="checkbox" className="form-check-input" checked={retire} onChange={(e) => setRetire(e.target.checked)} />
              <label htmlFor="mt-retire" className="form-check-label">
                Retire the unit instead of returning it to stock
              </label>
            </div>
            <p className="small text-secondary mt-2 mb-0">{retire ? 'The asset will be retired permanently.' : 'The asset becomes available again.'}</p>
          </>
        }
        confirmLabel="Complete"
        confirmVariant={retire ? 'warning' : 'success'}
        onConfirm={complete}
        onCancel={closeDialog}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Cancel this maintenance record?"
        body={
          <p className="mb-0">
            The record will be deleted and <strong>{m.asset.name}</strong> becomes available again. Use this only for records opened by mistake; otherwise complete it.
          </p>
        }
        confirmLabel="Delete record"
        confirmVariant="danger"
        onConfirm={remove}
        onCancel={closeDialog}
      />
    </div>
  );
}

function EditForm({ record, onCancel, onSaved }: { record: Maintenance; onCancel: () => void; onSaved: () => void }) {
  const [type, setType] = useState<MaintenanceType>(record.type);
  const [description, setDescription] = useState(record.description);
  const [cost, setCost] = useState(record.cost === null ? '' : String(record.cost));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: Record<string, string> = {};
    if (description.trim().length < 5) errors.description = 'Describe the work in at least 5 characters';
    const parsed = parseCost(cost);
    if (parsed.error) errors.cost = parsed.error;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setPending(true);
    try {
      await updateMaintenance(record.id, { type, description: description.trim(), cost: parsed.value });
      onSaved();
    } catch (err) {
      setError(err);
      setFieldErrors(fieldErrorsFrom(err));
      setPending(false);
    }
  };

  return (
    <form className="card card-body mb-3" onSubmit={submit} noValidate aria-label="Edit maintenance record">
      <ErrorAlert error={error} />
      <div className="row">
        <div className="col-md-6">
          <SelectField id="edit-type" label="Type" value={type} onChange={(e) => setType(e.target.value as MaintenanceType)} error={fieldErrors.type}>
            {Object.values(MaintenanceType).map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="col-md-6">
          <FormField id="edit-cost" label="Cost" type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} error={fieldErrors.cost} hint="Leave blank for no cost." />
        </div>
      </div>
      <TextAreaField id="edit-description" label="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} error={fieldErrors.description} maxLength={2000} required />
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { createRequest } from '../../api/requests.api';
import type { Asset, RequestDetail } from '../../types';
import { addDays, daysBetween, todayISO } from '../../utils/dates';
import { ErrorAlert } from '../common/ErrorAlert';
import { FormField, TextAreaField, fieldErrorsFrom } from '../common/FormField';

interface Props {
  asset: Asset;
  onCreated: (request: RequestDetail) => void;
  onCancel: () => void;
}

/** Employee request form (business-rules §3.5). Mirrors the zod rules client-side; server errors map to fields. */
export function RequestForm({ asset, onCreated, onCancel }: Props) {
  const today = todayISO();
  const defaultDays = asset.maxLoanDays ? Math.min(asset.maxLoanDays, 7) : 7;
  const [purpose, setPurpose] = useState('');
  const [requestedFrom, setRequestedFrom] = useState(today);
  const [expectedReturnDate, setExpectedReturnDate] = useState(addDays(today, defaultDays));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (purpose.trim().length < 5) errors.purpose = 'Please describe the purpose in at least 5 characters';
    else if (purpose.trim().length > 500) errors.purpose = 'Purpose must be at most 500 characters';
    if (!requestedFrom) errors.requestedFrom = 'Start date is required';
    else if (requestedFrom < today) errors.requestedFrom = 'Start date cannot be in the past';
    if (!expectedReturnDate) errors.expectedReturnDate = 'Return date is required';
    else if (requestedFrom && expectedReturnDate < requestedFrom) errors.expectedReturnDate = 'Return date must be on or after the start date';
    else if (asset.maxLoanDays && requestedFrom && daysBetween(requestedFrom, expectedReturnDate) > asset.maxLoanDays) {
      errors.expectedReturnDate = `Loan period exceeds the ${asset.maxLoanDays}-day limit for this asset`;
    }
    return errors;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setPending(true);
    try {
      const created = await createRequest({ assetId: asset.id, purpose: purpose.trim(), requestedFrom, expectedReturnDate });
      onCreated(created);
    } catch (err) {
      setError(err);
      setFieldErrors(fieldErrorsFrom(err));
      setPending(false);
    }
  };

  const loanDays = requestedFrom && expectedReturnDate && expectedReturnDate >= requestedFrom ? daysBetween(requestedFrom, expectedReturnDate) : null;

  return (
    <form className="card card-body mb-3" onSubmit={submit} noValidate aria-label="Request this asset">
      <h2 className="h6">Request this asset</h2>
      <ErrorAlert error={error} />
      <TextAreaField
        id="req-purpose"
        label="Purpose"
        rows={3}
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        error={fieldErrors.purpose}
        hint="Tell IT Staff what you need the unit for (5–500 characters)."
        maxLength={500}
        required
      />
      <div className="row">
        <div className="col-md-6">
          <FormField id="req-from" label="Needed from" type="date" min={today} value={requestedFrom} onChange={(e) => setRequestedFrom(e.target.value)} error={fieldErrors.requestedFrom} required />
        </div>
        <div className="col-md-6">
          <FormField
            id="req-to"
            label="Expected return"
            type="date"
            min={requestedFrom || today}
            max={asset.maxLoanDays && requestedFrom ? addDays(requestedFrom, asset.maxLoanDays) : undefined}
            value={expectedReturnDate}
            onChange={(e) => setExpectedReturnDate(e.target.value)}
            error={fieldErrors.expectedReturnDate}
            hint={asset.maxLoanDays ? `This asset can be loaned for at most ${asset.maxLoanDays} days.` : 'No loan limit for this asset.'}
            required
          />
        </div>
      </div>
      <div className="d-flex align-items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Submitting…' : 'Submit request'}
        </button>
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        {loanDays !== null && <span className="text-secondary small ms-auto">{loanDays + 1} day loan</span>}
      </div>
    </form>
  );
}

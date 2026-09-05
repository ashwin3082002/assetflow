import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldChrome {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

function Wrapper({ id, label, error, hint, children }: FieldChrome & { children: ReactNode }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      {children}
      {error && (
        <div className="invalid-feedback d-block" id={`${id}-error`}>
          {error}
        </div>
      )}
      {hint && !error && <div className="form-text">{hint}</div>}
    </div>
  );
}

/** Bootstrap input with label, inline validation error (client or server-provided) and optional hint. */
export function FormField({ id, label, error, hint, className = '', ...input }: FieldChrome & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <input id={id} className={`form-control ${error ? 'is-invalid' : ''} ${className}`} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...input} />
    </Wrapper>
  );
}

export function TextAreaField({ id, label, error, hint, className = '', ...textarea }: FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <textarea id={id} className={`form-control ${error ? 'is-invalid' : ''} ${className}`} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...textarea} />
    </Wrapper>
  );
}

export function SelectField({ id, label, error, hint, className = '', children, ...select }: FieldChrome & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <select id={id} className={`form-select ${error ? 'is-invalid' : ''} ${className}`} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...select}>
        {children}
      </select>
    </Wrapper>
  );
}

/** Maps API `details[{path,message}]` to a field → message object for forms. */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof error === 'object' && error !== null && 'details' in error) {
    const details = (error as { details?: { path: string; message: string }[] }).details ?? [];
    for (const d of details) if (!out[d.path]) out[d.path] = d.message;
  }
  return out;
}

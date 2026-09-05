interface Props {
  label?: string;
  fullPage?: boolean;
}

export function Loading({ label = 'Loading…', fullPage = false }: Props) {
  const spinner = (
    <div className="d-flex align-items-center gap-2 text-secondary" role="status" aria-live="polite">
      <div className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
  if (!fullPage) return <div className="py-4">{spinner}</div>;
  return <div className="d-flex justify-content-center align-items-center min-vh-100">{spinner}</div>;
}

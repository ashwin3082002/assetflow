interface Props {
  value: number | null;
  onChange: (rating: number) => void;
  disabled?: boolean;
  id?: string;
  /** id of the visible label element (aria-labelledby). */
  labelledBy?: string;
  /** id of an error/help element (aria-describedby). */
  describedBy?: string;
}

const LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** Five-star picker rendered as a radio group so keyboard and screen-reader users can rate too. */
export function RatingInput({ value, onChange, disabled = false, id = 'rating', labelledBy, describedBy }: Props) {
  return (
    <div className="d-flex align-items-center gap-2">
      <div role="radiogroup" aria-label={labelledBy ? undefined : 'Rating'} aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={!!describedBy} id={id} className="d-inline-flex">
        {LABELS.map((label, index) => {
          const star = index + 1;
          const selected = value !== null && star <= value;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} star${star === 1 ? '' : 's'}: ${label}`}
              className={`btn btn-link p-0 fs-3 lh-1 text-decoration-none ${selected ? 'text-warning' : 'text-secondary'}`}
              onClick={() => onChange(star)}
              disabled={disabled}
            >
              {selected ? '★' : '☆'}
            </button>
          );
        })}
      </div>
      <span className="small text-secondary" aria-live="polite">
        {value ? `${value}/5 · ${LABELS[value - 1]}` : 'Choose a rating'}
      </span>
    </div>
  );
}

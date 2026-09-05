interface Props {
  value: number | null;
  count: number;
  className?: string;
}

/** "★★★★☆ 4.2 (7)" or "No reviews yet". */
export function RatingStars({ value, count, className = '' }: Props) {
  if (value === null || count === 0) {
    return <span className={`text-secondary small ${className}`}>No reviews yet</span>;
  }
  const rounded = Math.round(value);
  const stars = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
  return (
    <span className={className} title={`${value} out of 5 from ${count} review${count === 1 ? '' : 's'}`}>
      <span className="text-warning" aria-hidden="true">
        {stars}
      </span>{' '}
      <span className="small">
        {value.toFixed(1)} ({count})
      </span>
    </span>
  );
}

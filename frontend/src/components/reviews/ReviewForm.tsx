import { useState, type FormEvent } from 'react';
import { createReview } from '../../api/reviews.api';
import type { Review } from '../../types';
import { ErrorAlert } from '../common/ErrorAlert';
import { TextAreaField, fieldErrorsFrom } from '../common/FormField';
import { RatingInput } from './RatingInput';

interface Props {
  requestId: string;
  assetName: string;
  onCreated: (review: Review) => void;
}

const COMMENT_MAX = 1000;

/** Employee review of a COMPLETED loan (business-rules §3.15): rating 1–5 required, comment optional. */
export function ReviewForm({ requestId, assetName, onCreated }: Props) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: Record<string, string> = {};
    if (rating === null) errors.rating = 'Please choose a rating from 1 to 5 stars';
    if (comment.trim().length > COMMENT_MAX) errors.comment = `Comment must be at most ${COMMENT_MAX} characters`;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || rating === null) return;

    setPending(true);
    try {
      const created = await createReview({ requestId, rating, comment: comment.trim() || null });
      onCreated(created);
    } catch (err) {
      setError(err);
      setFieldErrors(fieldErrorsFrom(err));
      setPending(false);
    }
  };

  return (
    <form className="card card-body mb-3" onSubmit={submit} noValidate aria-label="Review this loan">
      <h2 className="h6">How was {assetName}?</h2>
      <p className="small text-secondary">Your rating is averaged into the asset's score so colleagues know what to expect. One review per loan.</p>
      <ErrorAlert error={error} />
      <div className="mb-3">
        <span className="form-label d-block" id="rating-label">
          Rating
        </span>
        <RatingInput value={rating} onChange={setRating} disabled={pending} labelledBy="rating-label" describedBy={fieldErrors.rating ? 'rating-error' : undefined} />
        {fieldErrors.rating && (
          <div className="invalid-feedback d-block" role="alert" id="rating-error">
            {fieldErrors.rating}
          </div>
        )}
      </div>
      <TextAreaField
        id="review-comment"
        label="Comment (optional)"
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        error={fieldErrors.comment}
        hint={`${comment.trim().length}/${COMMENT_MAX} characters`}
        maxLength={COMMENT_MAX}
      />
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Submitting…' : 'Submit review'}
        </button>
      </div>
    </form>
  );
}

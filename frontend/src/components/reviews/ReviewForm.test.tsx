import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewForm } from './ReviewForm';
import * as reviewsApi from '../../api/reviews.api';
import type { Review } from '../../types';

vi.mock('../../api/reviews.api');

const createReview = vi.mocked(reviewsApi.createReview);

const review: Review = {
  id: 'rv1',
  rating: 4,
  comment: 'Great',
  createdAt: '2026-09-04T00:00:00.000Z',
  reviewer: { id: 'u1', fullName: 'Eli Employee' },
  asset: { id: 'a1', name: 'Dell Latitude' },
  requestId: 'r1',
};

describe('ReviewForm', () => {
  it('requires a rating before calling the API', async () => {
    const onCreated = vi.fn();
    render(<ReviewForm requestId="r1" assetName="Dell Latitude" onCreated={onCreated} />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a rating/);
    expect(createReview).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('stars behave as a radio group and submit rating + trimmed comment', async () => {
    const onCreated = vi.fn();
    createReview.mockResolvedValue(review);
    render(<ReviewForm requestId="r1" assetName="Dell Latitude" onCreated={onCreated} />);

    const group = screen.getByRole('radiogroup', { name: 'Rating' });
    expect(screen.getByText('Choose a rating')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /4 stars/ }));
    expect(screen.getByRole('radio', { name: /4 stars/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /5 stars/ })).toHaveAttribute('aria-checked', 'false');
    expect(group).toHaveTextContent('★★★★☆');
    expect(screen.getByText('4/5 · Very good')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Comment (optional)'), '  Great  ');
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(createReview).toHaveBeenCalledWith({ requestId: 'r1', rating: 4, comment: 'Great' });
    expect(onCreated).toHaveBeenCalledWith(review);
  });

  it('sends a null comment when empty and shows the API error inline', async () => {
    createReview.mockRejectedValueOnce({ status: 409, code: 'REVIEW_EXISTS', message: 'This request has already been reviewed' });
    render(<ReviewForm requestId="r1" assetName="Dell Latitude" onCreated={vi.fn()} />);
    await userEvent.click(screen.getByRole('radio', { name: /2 stars/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This request has already been reviewed');
    expect(createReview).toHaveBeenCalledWith({ requestId: 'r1', rating: 2, comment: null });
    expect(screen.getByRole('button', { name: 'Submit review' })).toBeEnabled();
  });
});

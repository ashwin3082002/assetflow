import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorAlert } from './ErrorAlert';

describe('ErrorAlert', () => {
  it('renders nothing without an error', () => {
    const { container } = render(<ErrorAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the API message, lists field details and offers retry', async () => {
    const onRetry = vi.fn();
    const error = {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid body',
      details: [
        { path: 'reason', message: 'String must contain at least 3 character(s)' },
        { path: 'cost', message: 'Number must be greater than or equal to 0' },
      ],
    };
    render(<ErrorAlert error={error} onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Invalid body');
    expect(alert).toHaveTextContent('reason: String must contain at least 3 character(s)');
    expect(alert).toHaveTextContent('cost: Number must be greater than or equal to 0');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back to Error.message and plain strings', () => {
    const { rerender } = render(<ErrorAlert error={new Error('Boom')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    rerender(<ErrorAlert error="Asset not found" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Asset not found');
  });
});

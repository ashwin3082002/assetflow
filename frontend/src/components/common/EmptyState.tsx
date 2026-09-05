import type { ReactNode } from 'react';

interface Props {
  title: string;
  message?: string;
  action?: ReactNode;
  icon?: string;
}

export function EmptyState({ title, message, action, icon = '📭' }: Props) {
  return (
    <div className="text-center text-secondary py-5 border rounded bg-light" data-testid="empty-state">
      <div className="fs-1" aria-hidden="true">
        {icon}
      </div>
      <h5 className="mt-2 mb-1">{title}</h5>
      {message && <p className="mb-3">{message}</p>}
      {action}
    </div>
  );
}

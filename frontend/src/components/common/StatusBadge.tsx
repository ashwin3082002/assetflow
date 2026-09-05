import { humanize } from '../../utils/format';

/** Bootstrap color per enum value (asset, request, maintenance, condition, role). */
const COLORS: Record<string, string> = {
  // AssetStatus
  AVAILABLE: 'success',
  RESERVED: 'info',
  ALLOCATED: 'primary',
  UNDER_MAINTENANCE: 'warning',
  RETIRED: 'secondary',
  // RequestStatus
  PENDING: 'warning',
  APPROVED: 'info',
  REJECTED: 'danger',
  RETURN_PENDING: 'info',
  COMPLETED: 'success',
  CANCELLED: 'secondary',
  // MaintenanceStatus
  OPEN: 'warning',
  // AssetCondition
  NEW: 'success',
  GOOD: 'success',
  FAIR: 'info',
  POOR: 'warning',
  DAMAGED: 'danger',
  // UserRole
  ADMIN: 'dark',
  IT_STAFF: 'primary',
  EMPLOYEE: 'secondary',
};

export function badgeColor(value: string): string {
  return COLORS[value] ?? 'light';
}

export function StatusBadge({ value, className = '' }: { value: string; className?: string }) {
  const color = badgeColor(value);
  const text = color === 'warning' || color === 'info' || color === 'light' ? 'text-dark' : '';
  return (
    <span className={`badge bg-${color} ${text} ${className}`} data-status={value}>
      {humanize(value)}
    </span>
  );
}

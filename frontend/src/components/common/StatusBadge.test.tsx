import { render, screen } from '@testing-library/react';
import { StatusBadge, badgeColor } from './StatusBadge';
import { AssetCondition, AssetStatus, MaintenanceStatus, RequestStatus, UserRole } from '../../types';

describe('StatusBadge', () => {
  it('maps every enum value to a Bootstrap color', () => {
    const all = [...Object.values(AssetStatus), ...Object.values(RequestStatus), ...Object.values(MaintenanceStatus), ...Object.values(AssetCondition), ...Object.values(UserRole)];
    for (const value of all) expect(badgeColor(value)).not.toBe('light');
  });

  it('renders a humanized label', () => {
    render(<StatusBadge value="UNDER_MAINTENANCE" />);
    expect(screen.getByText('Under maintenance')).toHaveClass('badge', 'bg-warning');
  });
});

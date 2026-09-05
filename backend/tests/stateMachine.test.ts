import { AssetStatus, MaintenanceStatus, RequestStatus } from '../src/common/enums';
import { ASSET_TRANSITIONS, MAINTENANCE_TRANSITIONS, REQUEST_TRANSITIONS, assertTransition, canTransition, isTerminal } from '../src/common/stateMachine';
import { isOverdue } from '../src/modules/assets/assets.serializers';

describe('canTransition (request)', () => {
  const allowed: [RequestStatus, RequestStatus][] = [
    [RequestStatus.PENDING, RequestStatus.APPROVED],
    [RequestStatus.PENDING, RequestStatus.REJECTED],
    [RequestStatus.PENDING, RequestStatus.CANCELLED],
    [RequestStatus.APPROVED, RequestStatus.ALLOCATED],
    [RequestStatus.APPROVED, RequestStatus.REJECTED],
    [RequestStatus.APPROVED, RequestStatus.CANCELLED],
    [RequestStatus.ALLOCATED, RequestStatus.RETURN_PENDING],
    [RequestStatus.ALLOCATED, RequestStatus.COMPLETED],
    [RequestStatus.RETURN_PENDING, RequestStatus.COMPLETED],
  ];

  it.each(allowed)('allows %s → %s', (from, to) => {
    expect(canTransition('request', from, to)).toBe(true);
    expect(() => assertTransition('request', from, to)).not.toThrow();
  });

  it('rejects every pair not in the table', () => {
    const all = Object.values(RequestStatus);
    for (const from of all) {
      for (const to of all) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect(canTransition('request', from, to)).toBe(expected);
      }
    }
  });

  it('terminal states have no exits', () => {
    for (const s of [RequestStatus.REJECTED, RequestStatus.COMPLETED, RequestStatus.CANCELLED]) {
      expect(isTerminal('request', s)).toBe(true);
      expect(REQUEST_TRANSITIONS[s]).toHaveLength(0);
    }
    expect(isTerminal('request', RequestStatus.PENDING)).toBe(false);
  });

  it('assertTransition throws a 409 INVALID_STATE_TRANSITION', () => {
    expect(() => assertTransition('request', RequestStatus.COMPLETED, RequestStatus.APPROVED)).toThrow(
      expect.objectContaining({ status: 409, code: 'INVALID_STATE_TRANSITION' }),
    );
  });
});

describe('canTransition (asset)', () => {
  it.each([
    [AssetStatus.AVAILABLE, AssetStatus.RESERVED],
    [AssetStatus.RESERVED, AssetStatus.AVAILABLE],
    [AssetStatus.RESERVED, AssetStatus.ALLOCATED],
    [AssetStatus.ALLOCATED, AssetStatus.AVAILABLE],
    [AssetStatus.ALLOCATED, AssetStatus.UNDER_MAINTENANCE],
    [AssetStatus.AVAILABLE, AssetStatus.UNDER_MAINTENANCE],
    [AssetStatus.UNDER_MAINTENANCE, AssetStatus.AVAILABLE],
    [AssetStatus.UNDER_MAINTENANCE, AssetStatus.RETIRED],
    [AssetStatus.AVAILABLE, AssetStatus.RETIRED],
  ])('allows %s → %s', (from, to) => {
    expect(canTransition('asset', from, to)).toBe(true);
  });

  it.each([
    [AssetStatus.RETIRED, AssetStatus.AVAILABLE],
    [AssetStatus.ALLOCATED, AssetStatus.RETIRED],
    [AssetStatus.RESERVED, AssetStatus.UNDER_MAINTENANCE],
    [AssetStatus.AVAILABLE, AssetStatus.ALLOCATED],
  ])('rejects %s → %s', (from, to) => {
    expect(canTransition('asset', from, to)).toBe(false);
  });

  it('RETIRED is terminal', () => {
    expect(ASSET_TRANSITIONS[AssetStatus.RETIRED]).toHaveLength(0);
    expect(isTerminal('asset', AssetStatus.RETIRED)).toBe(true);
  });
});

describe('canTransition (maintenance)', () => {
  it('only OPEN → COMPLETED is allowed; COMPLETED is terminal', () => {
    expect(canTransition('maintenance', MaintenanceStatus.OPEN, MaintenanceStatus.COMPLETED)).toBe(true);
    expect(canTransition('maintenance', MaintenanceStatus.COMPLETED, MaintenanceStatus.OPEN)).toBe(false);
    expect(canTransition('maintenance', MaintenanceStatus.OPEN, MaintenanceStatus.OPEN)).toBe(false);
    expect(MAINTENANCE_TRANSITIONS[MaintenanceStatus.COMPLETED]).toHaveLength(0);
    expect(isTerminal('maintenance', MaintenanceStatus.COMPLETED)).toBe(true);
    expect(() => assertTransition('maintenance', MaintenanceStatus.COMPLETED, MaintenanceStatus.COMPLETED)).toThrow(
      expect.objectContaining({ status: 409, code: 'INVALID_STATE_TRANSITION' }),
    );
  });
});

describe('isOverdue', () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  it('is true only for ALLOCATED / RETURN_PENDING with a past expected return date', () => {
    expect(isOverdue({ status: RequestStatus.ALLOCATED, expectedReturnDate: yesterday })).toBe(true);
    expect(isOverdue({ status: RequestStatus.RETURN_PENDING, expectedReturnDate: yesterday })).toBe(true);
    expect(isOverdue({ status: RequestStatus.ALLOCATED, expectedReturnDate: tomorrow })).toBe(false);
    expect(isOverdue({ status: RequestStatus.APPROVED, expectedReturnDate: yesterday })).toBe(false);
    expect(isOverdue({ status: RequestStatus.COMPLETED, expectedReturnDate: yesterday })).toBe(false);
  });
});

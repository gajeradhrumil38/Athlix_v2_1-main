import { describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: {} }));
import { attendance, packageSignals, packageUsage, type SessionPackage } from './packages';

const pkg = (over: Partial<SessionPackage>): SessionPackage => ({
  id: 'p', trainer_id: 'c', trainee_id: 't', title: '10 sessions', total_sessions: 10, price: null,
  starts_on: '2026-09-01', expires_on: null, count_no_shows: true, notes: null, archived_at: null, created_at: '2026-09-01T00:00:00Z', ...over,
});
const at = (date: string, status: 'completed' | 'no_show' | 'scheduled' | 'cancelled', trainee = 't') => ({ trainee_id: trainee, status, scheduled_at: `${date}T12:00:00` });
const TODAY = new Date('2026-10-03T15:00:00');

describe('packageUsage', () => {
  it('counts attended sessions and charged no-shows since the start', () => {
    const u = packageUsage([pkg({})], [at('2026-08-30', 'completed'), at('2026-09-02', 'completed'), at('2026-09-05', 'no_show'), at('2026-09-07', 'cancelled'), at('2026-09-09', 'completed', 'other')], TODAY)!;
    expect(u).toMatchObject({ used: 2, left: 8, noShows: 1, expired: false });
  });
  it('does not charge no-shows when the package says so', () => {
    expect(packageUsage([pkg({ count_no_shows: false })], [at('2026-09-05', 'no_show')], TODAY)!.used).toBe(0);
  });
  it('a renewal starts a fresh count; the old package stops at the new start', () => {
    const pkgs = [pkg({ id: 'old' }), pkg({ id: 'new', starts_on: '2026-09-20', created_at: '2026-09-20T00:00:00Z' })];
    const u = packageUsage(pkgs, [at('2026-09-10', 'completed'), at('2026-09-25', 'completed')], TODAY)!;
    expect(u.pkg.id).toBe('new');
    expect(u.used).toBe(1);
  });
  it('flags expiry and days left', () => {
    expect(packageUsage([pkg({ expires_on: '2026-10-01' })], [], TODAY)).toMatchObject({ expired: true, daysToExpiry: -2 });
    expect(packageUsage([pkg({ expires_on: '2026-10-10' })], [], TODAY)).toMatchObject({ expired: false, daysToExpiry: 7 });
  });
  it('ignores future-dated packages and archived ones', () => {
    expect(packageUsage([pkg({ starts_on: '2026-11-01' }), pkg({ archived_at: '2026-09-10T00:00:00Z' })], [], TODAY)).toBeNull();
  });
  it('never reports more used than the package holds', () => {
    const many = Array.from({ length: 12 }, (_, i) => at(`2026-09-${String(i + 2).padStart(2, '0')}`, 'completed'));
    expect(packageUsage([pkg({})], many, TODAY)).toMatchObject({ used: 10, left: 0 });
  });
});

describe('attendance', () => {
  it('is attended over attended plus no-shows, recent only', () => {
    expect(attendance([at('2026-09-20', 'completed'), at('2026-09-22', 'completed'), at('2026-09-24', 'no_show'), at('2026-05-01', 'no_show'), at('2026-09-26', 'cancelled')], 't', 90, TODAY))
      .toEqual({ attended: 2, noShows: 1, rate: 67 });
  });
  it('has no rate without any sessions', () => {
    expect(attendance([], 't', 90, TODAY).rate).toBeNull();
  });
});

describe('packageSignals', () => {
  const u = (over: object) => ({ pkg: pkg({}), used: 0, left: 5, noShows: 0, expired: false, daysToExpiry: null, ...over });
  it('flags used-up and expired as high, low and expiring as warn, otherwise nothing', () => {
    expect(packageSignals(u({ left: 0 }))[0]).toMatchObject({ level: 'high', label: 'Package used up' });
    expect(packageSignals(u({ expired: true }))[0]).toMatchObject({ level: 'high', label: 'Package expired' });
    expect(packageSignals(u({ left: 2 }))[0]).toMatchObject({ level: 'warn', label: '2 sessions left' });
    expect(packageSignals(u({ daysToExpiry: 5 }))[0]).toMatchObject({ level: 'warn' });
    expect(packageSignals(u({}))).toEqual([]);
    expect(packageSignals(null)).toEqual([]);
  });
});

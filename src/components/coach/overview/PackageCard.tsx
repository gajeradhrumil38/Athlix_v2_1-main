import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { CenterModal } from '../../shared/CenterModal';
import { confirmDialog } from '../../shared/ConfirmDialog';
import { getAppointmentsForTrainee, type TrainerAppointment } from '../../../lib/appointments';
import {
  archivePackage, attendance, createPackage, getMyPackages, packageUsage, recordWalkInSession,
  type PackageUsage, type SessionPackage,
} from '../../../lib/packages';
import { BigNumber, EmptyState, IDENTITY, StatLabel, TONE, WidgetCard, tile } from './Widget';

// The trainee's session package on their Overview: sessions left, expiry,
// turn-up rate, and one tap to log a walk-in session or renew.
export const PackageCard: React.FC<{ traineeId: string; traineeName: string }> = ({ traineeId, traineeName }) => {
  const { profile } = useAuth();
  const [pkgs, setPkgs] = useState<SessionPackage[] | null>(null);
  const [appts, setAppts] = useState<TrainerAppointment[]>([]);
  const [sheet, setSheet] = useState<SessionPackage | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([getMyPackages(), getAppointmentsForTrainee(traineeId)]);
    setPkgs(p.filter((x) => x.trainee_id === traineeId));
    setAppts(a);
  }, [traineeId]);
  useEffect(() => { load(); }, [load]);

  const usage: PackageUsage | null = pkgs ? packageUsage(pkgs, appts) : null;
  const turnUp = attendance(appts, traineeId);
  const first = traineeName.split(' ')[0] || traineeName;

  const walkIn = async () => {
    setBusy(true);
    const res = await recordWalkInSession(traineeId, traineeName, profile?.trainer_display_name || profile?.full_name || null);
    setBusy(false);
    if (!res.ok) { toast.error(res.error || 'Could not record the session.'); return; }
    toast.success('Session recorded');
    load();
  };

  if (pkgs == null) {
    return <WidgetCard title="Package" tone={IDENTITY.packages}><div className="h-20 animate-pulse rounded-2xl" style={tile()} /></WidgetCard>;
  }

  if (!usage) {
    return (
      <WidgetCard title="Package" tone={IDENTITY.packages}>
        <EmptyState icon="Clipboard" text={`No session package for ${first} yet. Track sessions left and get a heads-up before they run out.`}
          action={<button type="button" onClick={() => setSheet('new')} className="text-[13px] font-bold text-[var(--accent)]">+ Add a package</button>} />
        <PackageSheet open={sheet != null} traineeId={traineeId} base={null} onClose={() => setSheet(null)} onSaved={load} />
      </WidgetCard>
    );
  }

  const { pkg, used, left, expired, daysToExpiry, noShows } = usage;
  const low = left <= 2 || expired || (daysToExpiry != null && daysToExpiry <= 7);
  const tone = expired || left === 0 ? TONE.bad : low ? TONE.warn : IDENTITY.packages;

  return (
    <WidgetCard title="Package" tone={IDENTITY.packages} meta={pkg.title}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <BigNumber value={left} unit={`of ${pkg.total_sessions} left`} unitColor={tone} color={left === 0 ? TONE.bad : undefined} />
          <StatLabel>
            {used} used{noShows && pkg.count_no_shows ? ` (incl. ${noShows} no-show${noShows > 1 ? 's' : ''})` : ''}
          </StatLabel>
        </div>
        {turnUp.rate != null && (
          <div className="text-right">
            <p className="text-[20px] font-bold tabular-nums" style={{ color: turnUp.rate >= 90 ? TONE.good : turnUp.rate >= 75 ? TONE.warn : TONE.bad }}>{turnUp.rate}%</p>
            <p className="text-[11px] font-semibold text-[var(--text-secondary)]">turn-up · 90 days</p>
          </div>
        )}
      </div>

      {/* One segment per session: filled = used. */}
      <div className="mt-3 flex gap-[3px]" aria-hidden>
        {Array.from({ length: Math.min(pkg.total_sessions, 40) }, (_, i) => (
          <span key={i} className="h-2 flex-1 rounded-full"
            style={{ background: i < Math.round((used / pkg.total_sessions) * Math.min(pkg.total_sessions, 40)) ? tone : 'color-mix(in srgb, var(--text-primary) 8%, transparent)' }} />
        ))}
      </div>

      <p className="mt-2.5 text-[12px] text-[var(--text-secondary)]">
        Since {format(new Date(`${pkg.starts_on}T00:00:00`), 'MMM d')}
        {pkg.expires_on && (expired
          ? <span style={{ color: TONE.bad }}> · expired {format(new Date(`${pkg.expires_on}T00:00:00`), 'MMM d')}</span>
          : <span style={{ color: daysToExpiry != null && daysToExpiry <= 7 ? TONE.warn : undefined }}> · expires {format(new Date(`${pkg.expires_on}T00:00:00`), 'MMM d')} ({daysToExpiry}d)</span>)}
        {pkg.price != null && ` · $${pkg.price.toLocaleString()}`}
      </p>

      {low && (
        <p className="mt-2 text-[12.5px] font-semibold" style={{ color: tone }}>
          {expired ? 'Package expired — time to renew.' : left === 0 ? 'All sessions used — renew to keep going.' : left <= 2 ? `Only ${left} session${left === 1 ? '' : 's'} left — mention renewing.` : 'Expiring soon.'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={walkIn} disabled={busy || left === 0}
          className="h-9 px-3 rounded-xl text-[13px] font-bold disabled:opacity-40" style={{ ...tile(), color: 'var(--text-primary)' }}>
          + Session used
        </button>
        <button type="button" onClick={() => setSheet(pkg)}
          className="h-9 px-3 rounded-xl text-[13px] font-bold" style={low ? { background: 'var(--accent)', color: '#000' } : { ...tile(), color: 'var(--text-primary)' }}>
          Renew
        </button>
        <button type="button" className="h-9 px-2 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          onClick={async () => {
            if (!(await confirmDialog({ title: 'End this package?', message: 'It stops counting sessions. History stays in the calendar.', confirmLabel: 'End package', danger: true }))) return;
            const res = await archivePackage(pkg.id);
            if (!res.ok) { toast.error(res.error || 'Could not end the package.'); return; }
            load();
          }}>
          End
        </button>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-muted)]">Sessions count when an appointment is marked attended{pkg.count_no_shows ? ' or no-show' : ''}, or with "+ Session used".</p>

      <PackageSheet open={sheet != null} traineeId={traineeId} base={sheet === 'new' ? null : sheet} onClose={() => setSheet(null)} onSaved={load} />
    </WidgetCard>
  );
};

const SIZES = [5, 10, 12, 20];
const EXPIRY: { label: string; days: number | null }[] = [{ label: 'No expiry', days: null }, { label: '30 days', days: 30 }, { label: '60 days', days: 60 }, { label: '90 days', days: 90 }];

// New package, or a renewal pre-filled from the current one.
const PackageSheet: React.FC<{ open: boolean; traineeId: string; base: SessionPackage | null; onClose: () => void; onSaved: () => void }> = ({ open, traineeId, base, onClose, onSaved }) => {
  const [sessions, setSessions] = useState(10);
  const [price, setPrice] = useState('');
  const [expiry, setExpiry] = useState<number | null>(null);
  const [chargeNoShows, setChargeNoShows] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSessions(base?.total_sessions ?? 10);
    setPrice(base?.price != null ? String(base.price) : '');
    const days = base?.expires_on ? Math.round((new Date(`${base.expires_on}T00:00:00`).getTime() - new Date(`${base.starts_on}T00:00:00`).getTime()) / 86_400_000) : null;
    setExpiry(EXPIRY.some((e) => e.days === days) ? days : null);
    setChargeNoShows(base?.count_no_shows ?? true);
  }, [open, base]);

  const save = async () => {
    setBusy(true);
    const start = new Date();
    const startsOn = format(start, 'yyyy-MM-dd');
    const expiresOn = expiry ? format(new Date(start.getTime() + expiry * 86_400_000), 'yyyy-MM-dd') : null;
    const p = price.trim() ? Number(price) : null;
    const res = await createPackage({ traineeId, title: `${sessions} sessions`, totalSessions: sessions, price: p != null && Number.isFinite(p) ? p : null, startsOn, expiresOn, countNoShows: chargeNoShows });
    setBusy(false);
    if (!res.ok) { toast.error(res.error?.includes('session_packages') ? 'Run the session_packages migration first.' : res.error || 'Could not save the package.'); return; }
    toast.success(base ? 'Package renewed' : 'Package added');
    onSaved();
    onClose();
  };

  const chip = (on: boolean): React.CSSProperties => (on ? { background: 'var(--accent)', color: '#000' } : { ...tile(), color: 'var(--text-primary)' });

  return (
    <CenterModal open={open} onClose={onClose} zIndex={90}>
      <div className="solid-panel w-full max-w-[400px] rounded-[24px] p-5" style={{ border: '1px solid var(--border)' }}>
        <h2 className="text-[19px] font-bold text-[var(--text-primary)]">{base ? 'Renew package' : 'New package'}</h2>
        <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">Starts today.{base ? ' The current package stops counting.' : ''}</p>

        <p className="mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Sessions</p>
        <div className="flex items-center gap-2">
          {SIZES.map((n) => <button key={n} type="button" onClick={() => setSessions(n)} className="h-10 flex-1 rounded-xl text-[15px] font-bold" style={chip(sessions === n)}>{n}</button>)}
          <input type="number" min={1} max={500} value={SIZES.includes(sessions) ? '' : sessions} placeholder="Other" aria-label="Custom number of sessions"
            onChange={(e) => { const v = Math.round(Number(e.target.value)); if (v > 0) setSessions(Math.min(500, v)); }}
            className="h-10 w-[72px] rounded-xl bg-transparent px-2 text-center text-[14px] font-bold text-[var(--text-primary)] outline-none" style={{ ...tile(), border: 'none' }} />
        </div>

        <p className="mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Price <span className="normal-case tracking-normal font-semibold">(optional)</span></p>
        <div className="flex items-center gap-1 h-10 rounded-xl px-3" style={tile()}>
          <span className="text-[var(--text-muted)] font-semibold">$</span>
          <input type="number" min={0} step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" aria-label="Price"
            className="flex-1 bg-transparent text-[15px] font-semibold text-[var(--text-primary)] outline-none" style={{ border: 'none' }} />
        </div>

        <p className="mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Expires</p>
        <div className="grid grid-cols-4 gap-1.5">
          {EXPIRY.map((e) => <button key={e.label} type="button" onClick={() => setExpiry(e.days)} className="h-9 rounded-xl text-[12px] font-bold" style={chip(expiry === e.days)}>{e.label}</button>)}
        </div>

        <label className="mt-4 flex items-center justify-between gap-3 text-[13px] text-[var(--text-primary)]">
          <span>No-shows use a session</span>
          <input type="checkbox" checked={chargeNoShows} onChange={(e) => setChargeNoShows(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-2xl text-[14px] font-semibold text-[var(--text-primary)]" style={tile()}>Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="h-11 rounded-2xl text-[14px] font-bold disabled:opacity-50" style={{ background: 'var(--accent)', color: '#000' }}>
            {busy ? 'Saving…' : base ? 'Renew' : 'Add package'}
          </button>
        </div>
      </div>
    </CenterModal>
  );
};

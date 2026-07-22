import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Search, SlidersHorizontal, X, UtensilsCrossed, Package, Camera } from 'lucide-react';
import type { FoodScan } from '../types';
import { deleteFoodScan, getFoodScans } from '../../../lib/foodData';
import { deleteFoodImage } from '../services/foodRecognition.service';
import { useAuth } from '../../../contexts/AuthContext';
import { useProgress } from '../../../contexts/ProgressContext';
import { scoreDish } from '../services/healthScore.service';
import { useNutritionPriority } from '../hooks/useNutritionPriority';

interface Props {
  onViewDetail: (scan: FoodScan) => void;
  onScan?: () => void;
}

// ─── Mini health score ring (inline for list performance) ─────────────────────

function scoreColor(s: number) {
  return s >= 67 ? '#4ade80' : s >= 34 ? '#fbbf24' : '#f87171';
}

const MiniRing: React.FC<{ score: number; grade: string; delay?: number }> = ({ score, grade, delay = 0 }) => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 80 + delay); return () => clearTimeout(t); }, [delay]);
  const R = 21; const CX = 28; const SIZE = 56;
  const CIRC = 2 * Math.PI * R;
  const color  = scoreColor(score);
  const offset = animated ? CIRC * (1 - score / 100) : CIRC;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle cx={CX} cy={CX} r={R} fill="none" stroke="#1e2229" strokeWidth={6} />
      <circle cx={CX} cy={CX} r={R} fill="none" stroke={color} strokeWidth={6}
        strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset}
        transform={`rotate(-90 ${CX} ${CX})`}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }} />
      <text x={CX} y={CX} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={14} fontWeight="900" fontFamily="inherit">{grade}</text>
    </svg>
  );
};

// ─── Skeleton card ────────────────────────────────────────────────────────────

const SkeletonCard: React.FC = () => (
  <div className="rounded-2xl overflow-hidden animate-pulse"
    style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.06)' }}>
    <div style={{ height: 140, background: 'rgba(255,255,255,0.04)' }} />
    <div className="px-4 py-3 flex items-center justify-between">
      <div className="flex gap-4">
        {[50, 40, 45].map((w, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3.5 rounded" style={{ width: w, background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-2.5 rounded" style={{ width: w * 0.6, background: 'rgba(255,255,255,0.04)' }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="space-y-1">
          <div className="h-5 w-12 rounded" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="h-2.5 w-8 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
        </div>
      </div>
    </div>
  </div>
);

// ─── History card ─────────────────────────────────────────────────────────────

const HistoryCard: React.FC<{ scan: FoodScan; onView: () => void; index?: number }> = ({ scan, onView, index = 0 }) => {
  const { isPriority } = useNutritionPriority();
  const dishScore = useMemo(() => scoreDish(scan.foods_detected), [scan.foods_detected]);

  const imageUrl  = scan.thumbnail_url || scan.image_url;
  const isLabel   = scan.foods_detected[0]?.source === 'label';
  const topFoods  = scan.foods_detected.slice(0, 2).map((f) => f.name).join(', ');
  const extraCount = scan.foods_detected.length > 2 ? scan.foods_detected.length - 2 : 0;

  const MACROS = [
    { key: 'protein' as const, label: 'Protein', val: scan.total_protein, color: '#60a5fa' },
    { key: 'carbs'   as const, label: 'Carbs',   val: scan.total_carbs,   color: '#fbbf24' },
    { key: 'fat'     as const, label: 'Fat',      val: scan.total_fat,    color: '#f87171' },
  ];

  return (
    <div
      onClick={onView}
      className="rounded-2xl overflow-hidden cursor-pointer active:opacity-75 transition-opacity"
      style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>

      {/* ── Image strip + text overlay ── */}
      <div className="relative" style={{ height: 148 }}>
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: isLabel ? 'rgba(200,255,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
            {isLabel
              ? <Package className="w-10 h-10" style={{ color: 'rgba(200,255,0,0.2)' }} />
              : <UtensilsCrossed className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.1)' }} />}
          </div>
        )}

        {/* Gradient: bottom-heavy so text is readable */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to top, rgba(22,25,31,0.97) 0%, rgba(22,25,31,0.55) 45%, transparent 100%)',
        }} />

        {/* Label badge (top-left) */}
        {isLabel && (
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: 'rgba(200,255,0,0.15)', border: '1px solid rgba(200,255,0,0.3)' }}>
            <Package className="w-2.5 h-2.5" style={{ color: '#C8FF00' }} />
            <span style={{ color: '#C8FF00', fontSize: 9, fontWeight: 800, letterSpacing: '0.1em' }}>NUTRITION LABEL</span>
          </div>
        )}

        {/* Date + food names on gradient */}
        <div className="absolute bottom-0 left-4 right-4 pb-3">
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, marginBottom: 3 }}>
            {format(parseISO(scan.scan_date), 'EEE d MMM · h:mm a')}
          </p>
          <p className="truncate" style={{ color: '#fff', fontSize: 15, fontWeight: 800, lineHeight: 1.25 }}>
            {topFoods || 'No foods logged'}
            {extraCount > 0 && (
              <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>  +{extraCount} more</span>
            )}
          </p>
        </div>
      </div>

      {/* ── Nutrition strip ── */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Macro columns */}
        <div className="flex items-center gap-4">
          {MACROS.map(({ key, label, val, color }) => {
            const hi = isPriority(key);
            return (
              <div key={key} className="flex flex-col"
                style={{
                  padding:         hi ? '3px 7px 3px 5px' : '0',
                  borderRadius:    8,
                  background:      hi ? `${color}12` : 'transparent',
                  border:          hi ? `1px solid ${color}40` : 'none',
                  position:        'relative',
                }}>
                <p style={{ color, fontSize: hi ? 14 : 13, fontWeight: 900, lineHeight: 1 }}>
                  {(val ?? 0).toFixed(0)}
                  <span style={{ fontSize: 9, fontWeight: 600, color: `${color}99`, marginLeft: 1 }}>g</span>
                </p>
                <p style={{
                  color: hi ? color : 'rgba(255,255,255,0.4)',
                  fontSize: 9, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2,
                }}>
                  {label}
                </p>
                {hi && (
                  <div style={{
                    position: 'absolute', top: 3, right: 3,
                    width: 4, height: 4, borderRadius: '50%', background: color,
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Health ring + calories */}
        <div className="flex items-center gap-2.5 shrink-0">
          <MiniRing score={dishScore.overall} grade={dishScore.grade} delay={Math.min(index * 55, 500)} />
          <div className="text-right">
            <p style={{ color: '#C8FF00', fontSize: 24, fontWeight: 900, lineHeight: 1 }}>
              {scan.total_calories}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              kcal
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Filters sheet ────────────────────────────────────────────────────────────

interface Filters { calMin: number; calMax: number; dateFrom: string; dateTo: string }
const DEFAULT_FILTERS: Filters = { calMin: 0, calMax: 9999, dateFrom: '', dateTo: '' };

const FiltersSheet: React.FC<{ filters: Filters; onChange: (f: Filters) => void; onClose: () => void }> = ({
  filters, onChange, onClose,
}) => {
  const [local, setLocal] = useState(filters);
  const apply = () => { onChange(local); onClose(); };
  const reset = () => { setLocal(DEFAULT_FILTERS); onChange(DEFAULT_FILTERS); onClose(); };
  const inp = (val: string | number, key: keyof Filters, type = 'number') => (
    <input type={type} value={val}
      onChange={(e) => setLocal((p) => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
      className="w-full px-3 py-2.5 rounded-xl text-[13px] focus:outline-none"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', caretColor: '#C8FF00' }}
    />
  );
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-[480px] rounded-t-[24px] pb-[max(20px,env(safe-area-inset-bottom))]"
        style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-5" style={{ background: 'rgba(255,255,255,0.3)' }} />
        <div className="flex items-center justify-between px-5 mb-5">
          <p style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>Filter</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>
        <div className="px-5 space-y-4 pb-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Min cal</p>
              {inp(local.calMin, 'calMin')}
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Max cal</p>
              {inp(local.calMax === 9999 ? '' : local.calMax, 'calMax')}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>From</p>
              {inp(local.dateFrom, 'dateFrom', 'date')}
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>To</p>
              {inp(local.dateTo, 'dateTo', 'date')}
            </div>
          </div>
          <button onClick={apply}
            className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all"
            style={{ background: '#C8FF00' }}>Apply</button>
          <button onClick={reset}
            className="w-full py-3 text-[13px] font-semibold text-center active:scale-[0.98] transition-all"
            style={{ color: 'rgba(255,255,255,0.4)' }}>Clear All Filters</button>
        </div>
      </div>
    </div>
  );
};

// ─── Delete confirmation ──────────────────────────────────────────────────────

const DeleteConfirm: React.FC<{ onConfirm: () => void; onCancel: () => void; loading: boolean }> = ({
  onConfirm, onCancel, loading,
}) => (
  <div className="fixed inset-0 z-[400] flex items-center justify-center px-6"
    style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
    <div className="w-full max-w-[320px] rounded-2xl p-6 text-center"
      style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.1)' }}>
      <p style={{ color: '#fff', fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Delete this scan?</p>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 20 }}>This can't be undone.</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl text-[13px] font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>Cancel</button>
        <button onClick={onConfirm} disabled={loading}
          className="flex-1 py-3 rounded-xl text-[13px] font-bold disabled:opacity-50"
          style={{ background: '#f87171', color: '#000' }}>
          {loading ? '…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
);

// ─── Main FoodHistory ─────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export const FoodHistory: React.FC<Props> = ({ onViewDetail, onScan }) => {
  const { user } = useAuth();
  const { startProgress, doneProgress } = useProgress();

  const [scans, setScans]             = useState<FoodScan[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(0);

  const [query, setQuery]             = useState('');
  const [filters, setFilters]         = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FoodScan | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const loaderRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (pg: number, replace: boolean) => {
    if (!user) return;
    if (pg === 0) { setLoading(true); startProgress(); }
    else setLoadingMore(true);
    try {
      const { scans: newScans, total: t } = await getFoodScans(user.id, pg, PAGE_SIZE);
      setScans((prev) => replace ? newScans : [...prev, ...newScans]);
      setTotal(t);
    } catch { /* silent */ }
    finally {
      if (pg === 0) { setLoading(false); doneProgress(); }
      else setLoadingMore(false);
    }
  }, [user, startProgress, doneProgress]);

  useEffect(() => { load(0, true); }, [load]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loadingMore && scans.length < total) {
        const next = page + 1;
        setPage(next);
        load(next, false);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [load, loadingMore, page, scans.length, total]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteFoodScan(deleteTarget.id);
      if (deleteTarget.image_url)     deleteFoodImage(deleteTarget.image_url);
      if (deleteTarget.thumbnail_url) deleteFoodImage(deleteTarget.thumbnail_url);
      setScans((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setTotal((t) => t - 1);
    } catch { /* silent */ }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  const visible = scans.filter((s) => {
    if (query) {
      const q = query.toLowerCase();
      const match =
        s.foods_detected.some((f) => f.name.toLowerCase().includes(q)) ||
        format(parseISO(s.scan_date), 'EEE d MMM yyyy').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (s.total_calories < filters.calMin || s.total_calories > filters.calMax) return false;
    const scanDay = s.scan_date.slice(0, 10);
    if (filters.dateFrom && scanDay < filters.dateFrom) return false;
    if (filters.dateTo   && scanDay > filters.dateTo)   return false;
    return true;
  });

  const hasFilters = filters.calMin > 0 || filters.calMax < 9999 || !!filters.dateFrom || !!filters.dateTo;

  return (
    <div>
      {/* Search + filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meals, foods, dates…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-[13px] focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', caretColor: '#C8FF00' }}
          />
        </div>
        <button onClick={() => setShowFilters(true)}
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-90"
          style={{
            background: hasFilters ? 'rgba(200,255,0,0.12)' : 'rgba(255,255,255,0.06)',
            border: `1px solid ${hasFilters ? 'rgba(200,255,0,0.3)' : 'rgba(255,255,255,0.1)'}`,
          }}>
          <SlidersHorizontal className="w-4 h-4" style={{ color: hasFilters ? '#C8FF00' : 'rgba(255,255,255,0.5)' }} />
        </button>
      </div>

      {/* Count */}
      {!loading && total > 0 && (
        <p className="mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 600 }}>
          {visible.length} of {total} scan{total !== 1 ? 's' : ''}
          {hasFilters && ' (filtered)'}
        </p>
      )}

      {/* Card list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-5"
            style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.12)' }}>
            <UtensilsCrossed className="w-9 h-9" style={{ color: 'rgba(200,255,0,0.4)' }} />
          </div>
          <p style={{ color: '#fff', fontSize: 17, fontWeight: 800, marginBottom: 6 }}>
            {hasFilters || query ? 'No matches' : 'No scans yet'}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.5, maxWidth: 240, marginBottom: 24 }}>
            {hasFilters || query
              ? 'Try adjusting your filters or search terms.'
              : 'Scan a meal, snack, or packaged product to see it here.'}
          </p>
          {!hasFilters && !query && onScan && (
            <button
              onClick={onScan}
              className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-[14px] font-bold text-black active:scale-95 transition-all"
              style={{ background: '#C8FF00' }}>
              <Camera className="w-4 h-4" /> Scan Your First Meal
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((scan, idx) => (
            <HistoryCard key={scan.id} scan={scan} onView={() => onViewDetail(scan)} index={idx} />
          ))}
          <div ref={loaderRef} style={{ height: 1 }} />
          {loadingMore && (
            <div className="py-4 flex justify-center">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'rgba(200,255,0,0.5)', borderTopColor: 'transparent' }} />
            </div>
          )}
        </div>
      )}

      {showFilters && (
        <FiltersSheet filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />
      )}
      {deleteTarget && (
        <DeleteConfirm onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
    </div>
  );
};

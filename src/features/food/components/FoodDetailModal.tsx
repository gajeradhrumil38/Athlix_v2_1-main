import React, { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { X, Trash2, Share2, Edit3, Check, UtensilsCrossed, Plus, Globe } from 'lucide-react';
import type { DetectedFood, FoodScan } from '../types';
import { calcTotals, searchFood } from '../services/foodRecognition.service';
import { deleteFoodScan, updateFoodScan } from '../../../lib/foodData';
import { deleteFoodImage } from '../services/foodRecognition.service';
import { scoreDish, scoreLabel } from '../services/healthScore.service';
import { DishScoreRing, HealthRings } from './HealthRings';
import { NutritionFactsTable } from './NutritionFactsTable';
import { CompliancePanel } from './CompliancePanel';
import { RegionStandardSheet } from './RegionStandardSheet';
import { useNutritionPriority } from '../hooks/useNutritionPriority';
import { useRegionStandard } from '../hooks/useRegionStandard';

interface Props {
  scan: FoodScan;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (scan: FoodScan) => void;
}

// ── Inline food row (view + edit) ────────────────────────────────────────────

const FoodRow: React.FC<{
  food: DetectedFood;
  editing: boolean;
  onUpdate: (f: DetectedFood) => void;
  onRemove: () => void;
}> = ({ food, editing, onUpdate, onRemove }) => {
  const eff = (val: number) => parseFloat((val * food.servings).toFixed(1));

  return (
    <div className="px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-start gap-3">
        {/* Color dot */}
        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#C8FF00' }} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-tight" style={{ color: '#fff' }}>{food.name}</p>
          {food.brand && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{food.brand}</p>}
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{food.servingSize}</p>

          {/* Macros */}
          <div className="flex items-center gap-3 mt-1.5">
            {[
              { l: 'P', v: eff(food.protein),  c: '#60a5fa' },
              { l: 'C', v: eff(food.carbs),    c: '#fbbf24' },
              { l: 'F', v: eff(food.fat),      c: '#f87171' },
            ].map(({ l, v, c }) => (
              <span key={l} className="text-[10px] font-semibold" style={{ color: c }}>
                {l} {v}g
              </span>
            ))}
          </div>

          {/* Servings editor when in edit mode */}
          {editing && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Servings:</span>
              <button onClick={() => onUpdate({ ...food, servings: Math.max(0.5, food.servings - 0.5) })}
                className="w-6 h-6 rounded-lg text-sm font-bold flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>−</button>
              <span className="text-[13px] font-bold w-8 text-center tabular-nums" style={{ color: '#fff' }}>
                {food.servings}
              </span>
              <button onClick={() => onUpdate({ ...food, servings: food.servings + 0.5 })}
                className="w-6 h-6 rounded-lg text-sm font-bold flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>+</button>
              <button onClick={onRemove} className="ml-2 w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(248,113,113,0.1)' }}>
                <Trash2 className="w-3 h-3" style={{ color: '#f87171' }} />
              </button>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[20px] font-black tabular-nums" style={{ color: '#C8FF00' }}>
            {Math.round(food.calories * food.servings)}
          </p>
          <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>kcal</p>
        </div>
      </div>
    </div>
  );
};

// ── Quick-add search (edit mode) ─────────────────────────────────────────────

const QuickAddSearch: React.FC<{ onAdd: (f: DetectedFood) => void }> = ({ onAdd }) => {
  const [q, setQ]           = useState('');
  const [res, setRes]       = useState<DetectedFood[]>([]);
  const [busy, setBusy]     = useState(false);
  const [done, setDone]     = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try { setRes(await searchFood(q)); setDone(true); }
    catch { setRes([]); setDone(true); }
    finally { setBusy(false); }
  };

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Add a food…"
          className="flex-1 px-3 py-2 rounded-xl text-[13px] focus:outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', caretColor: '#C8FF00' }}
        />
        <button onClick={search} disabled={busy}
          className="px-3 py-2 rounded-xl text-[12px] font-bold active:scale-95 transition-all"
          style={{ background: '#C8FF00', color: '#000' }}>
          {busy ? '…' : <Plus className="w-4 h-4" />}
        </button>
      </div>
      {done && res.length === 0 && (
        <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No results for "{q}"</p>
      )}
      {res.slice(0, 4).map((f) => (
        <button key={f.id} onClick={() => { onAdd(f); setRes([]); setQ(''); setDone(false); }}
          className="w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between active:scale-[0.98] transition-all"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-[12px] font-semibold" style={{ color: '#fff' }}>{f.name}</p>
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{f.servingSize}</p>
          </div>
          <span className="text-[14px] font-black" style={{ color: '#C8FF00' }}>{Math.round(f.calories)} kcal</span>
        </button>
      ))}
    </div>
  );
};

// ── Share helper ─────────────────────────────────────────────────────────────

function buildShareText(scan: FoodScan, totals: ReturnType<typeof calcTotals>): string {
  const date = format(parseISO(scan.scan_date), 'EEE d MMM yyyy · h:mm a');
  const items = scan.foods_detected.map((f) =>
    `• ${f.name} — ${Math.round(f.calories * f.servings)} kcal (×${f.servings} serving)`
  ).join('\n');
  return [
    `🍽 Food Log — ${date}`,
    '',
    items || '(no items)',
    '',
    `Calories: ${totals.total_calories} kcal`,
    `Protein: ${totals.total_protein.toFixed(1)}g  Carbs: ${totals.total_carbs.toFixed(1)}g  Fat: ${totals.total_fat.toFixed(1)}g`,
    '',
    'Logged with Athlix',
  ].join('\n');
}

// ── FoodDetailModal ──────────────────────────────────────────────────────────

export const FoodDetailModal: React.FC<Props> = ({ scan: initialScan, onClose, onDeleted, onUpdated }) => {
  const [scan, setScan]       = useState(initialScan);
  const [foods, setFoods]     = useState<DetectedFood[]>(initialScan.foods_detected);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const totals    = useMemo(() => calcTotals(foods), [foods]);
  const dishScore = useMemo(() => scoreDish(foods),  [foods]);
  const { isPriority } = useNutritionPriority();
  const { region, standard, comparisonRegions } = useRegionStandard();
  const [showRegion, setShowRegion] = useState(false);

  // Label scan? — full nutrition panel was persisted on the saved food
  const labelData  = useMemo(() => foods.find((f) => f.source === 'label' && f.labelData)?.labelData, [foods]);
  const labelScore = useMemo(() => (labelData ? scoreLabel(labelData, region) : null), [labelData, region]);

  // ── Save edits ─────────────────────────────────────────────────────────

  const saveEdits = async () => {
    setSaving(true);
    try {
      const updated = await updateFoodScan(scan.id, { foods_detected: foods, ...totals });
      setScan(updated);
      onUpdated(updated);
      setEditing(false);
    } catch { /* keep editing open */ }
    finally { setSaving(false); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteFoodScan(scan.id);
      if (scan.image_url)     deleteFoodImage(scan.image_url);
      if (scan.thumbnail_url) deleteFoodImage(scan.thumbnail_url);
      onDeleted(scan.id);
    } catch { setDeleting(false); setShowDeleteConfirm(false); }
  };

  // ── Share ──────────────────────────────────────────────────────────────

  const share = async () => {
    const text = buildShareText(scan, totals);
    if (navigator.share) {
      await navigator.share({ title: 'Food Log — Athlix', text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[250] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-[480px] rounded-t-[24px] overflow-y-auto no-scrollbar pb-[max(28px,env(safe-area-inset-bottom))]"
        style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '92vh' }}>

        {/* Drag handle */}
        <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-4 opacity-30" style={{ background: '#fff' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {format(parseISO(scan.scan_date), 'EEE, d MMM yyyy')}
            </p>
            <p className="text-[17px] font-bold" style={{ color: '#fff' }}>
              {format(parseISO(scan.scan_date), 'h:mm a')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <>
                <button onClick={share}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Share2 className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.55)' }} />
                </button>
                <button onClick={() => setEditing(true)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Edit3 className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.55)' }} />
                </button>
                <button onClick={() => setShowDeleteConfirm(true)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90"
                  style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.18)' }}>
                  <Trash2 className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
                </button>
              </>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
            </button>
          </div>
        </div>

        {/* Full-size image */}
        {scan.image_url && (
          <div className="mx-4 mb-4 rounded-2xl overflow-hidden">
            <img src={scan.image_url} alt="Scanned food"
              className="w-full object-cover" style={{ maxHeight: 260 }} />
          </div>
        )}

        {/* Totals summary */}
        <div className="mx-4 mb-3 rounded-2xl p-4"
          style={{ background: 'rgba(200,255,0,0.05)', border: '1px solid rgba(200,255,0,0.12)' }}>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-[48px] font-black leading-none tabular-nums" style={{ color: '#C8FF00' }}>
              {totals.total_calories}
            </span>
            <span className="text-[14px] font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>kcal total</span>
            {isPriority('calories') && (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#C8FF00', marginBottom: 12 }} />
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'protein' as const, label: 'Protein', val: totals.total_protein, color: '#60a5fa' },
              { key: 'carbs'   as const, label: 'Carbs',   val: totals.total_carbs,   color: '#fbbf24' },
              { key: 'fat'     as const, label: 'Fat',     val: totals.total_fat,     color: '#f87171' },
            ]).map(({ key, label, val, color }) => {
              const hi = isPriority(key);
              return (
                <div key={label} className="rounded-xl p-2.5 text-center" style={{
                  background: hi ? `${color}10` : 'rgba(255,255,255,0.04)',
                  border:     hi ? `1.5px solid ${color}55` : '1px solid rgba(255,255,255,0.07)',
                }}>
                  <p className="text-[9px] uppercase tracking-wider mb-0.5"
                    style={{ color: hi ? color : 'rgba(255,255,255,0.3)', fontWeight: hi ? 800 : 600 }}>{label}</p>
                  <p className="tabular-nums" style={{ color, fontSize: hi ? 18 : 16, fontWeight: 900 }}>
                    {val.toFixed(1)}g
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Health score — label scan shows full rings, dish shows compact ring */}
        {labelData && labelScore ? (
          <>
            <button onClick={() => setShowRegion(true)}
              className="mx-4 mb-3 w-[calc(100%-32px)] flex items-center gap-2 px-4 py-2.5 rounded-xl active:scale-[0.99] transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Globe className="w-3.5 h-3.5" style={{ color: '#C8FF00' }} />
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
                Scored against <span style={{ color: '#fff', fontWeight: 800 }}>{standard.flag} {standard.authority}</span>
              </span>
              <span style={{ color: '#C8FF00', fontSize: 11, fontWeight: 700, marginLeft: 'auto' }}>Change</span>
            </button>
            <div className="mx-4 mb-3 rounded-2xl px-5 py-6"
              style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
              <HealthRings score={labelScore} />
            </div>
          </>
        ) : foods.length > 0 ? (
          <div className="mx-4 mb-3 rounded-2xl px-4 py-3"
            style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
            <DishScoreRing score={dishScore} />
          </div>
        ) : null}

        {/* Food list */}
        <div className="mx-4 mb-3 rounded-2xl overflow-hidden"
          style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: 'rgba(255,255,255,0.35)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            Detected Foods ({foods.length})
          </p>

          {foods.length === 0 ? (
            <div className="flex flex-col items-center py-10">
              <UtensilsCrossed className="w-8 h-8 mb-3" style={{ color: 'rgba(255,255,255,0.15)' }} />
              <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.3)' }}>No foods in this scan</p>
            </div>
          ) : (
            foods.map((food, i) => (
              <FoodRow key={`${food.id}-${i}`} food={food} editing={editing}
                onUpdate={(u) => setFoods((prev) => prev.map((f, j) => (j === i ? u : f)))}
                onRemove={() => setFoods((prev) => prev.filter((_, j) => j !== i))}
              />
            ))
          )}

          {editing && <QuickAddSearch onAdd={(f) => setFoods((prev) => [...prev, f])} />}
        </div>

        {/* Full nutrition facts + standards comparison — for saved label scans */}
        {labelData && (
          <div className="mx-4 mb-3 space-y-3">
            <NutritionFactsTable label={labelData} />
            <CompliancePanel label={labelData} userRegion={region} comparisonRegions={comparisonRegions} />
          </div>
        )}

        {/* Edit action bar */}
        {editing && (
          <div className="px-4 pb-2 space-y-2">
            <button onClick={saveEdits} disabled={saving}
              className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
              style={{ background: '#C8FF00' }}>
              <Check className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={() => { setFoods(scan.foods_detected); setEditing(false); }}
              className="w-full py-3 rounded-xl text-[13px] font-semibold text-center transition-all active:scale-[0.98]"
              style={{ color: 'rgba(255,255,255,0.4)' }}>
              Cancel
            </button>
          </div>
        )}

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
            <div className="w-full max-w-[300px] rounded-2xl p-6 text-center"
              style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-[16px] font-bold mb-1.5" style={{ color: '#fff' }}>Delete this scan?</p>
              <p className="text-[12px] mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                The image and nutrition data will be permanently removed.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-xl text-[13px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>Cancel</button>
                <button onClick={doDelete} disabled={deleting}
                  className="flex-1 py-3 rounded-xl text-[13px] font-bold disabled:opacity-50"
                  style={{ background: '#f87171', color: '#000' }}>
                  {deleting ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showRegion && <RegionStandardSheet mode="settings" onClose={() => setShowRegion(false)} />}
      </div>
    </div>
  );
};

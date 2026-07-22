/**
 * FoodResults — shown after a dish/meal photo is scanned.
 *
 * Sections:
 *  1. Total nutrition summary card
 *  2. Individual food cards (editable servings)
 *  3. Health Snapshot — score ring + macro DV bars
 *  4. Add food manually
 *  5. Save / Scan Again
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Edit3, Plus, RotateCcw, Trash2, X, Search, SlidersHorizontal } from 'lucide-react';
import type { DetectedFood, ScanState } from '../types';
import { calcTotals, searchFood, analyzePackagedIngredients, type PackagedIngredientWarning } from '../services/foodRecognition.service';
import { scoreDish } from '../services/healthScore.service';
import { DishScoreRing } from './HealthRings';
import { useNutritionPriority, type MacroKey } from '../hooks/useNutritionPriority';
import { NutritionPrioritySheet } from './NutritionPrioritySheet';
import { RealLifeAdviceCard } from './RealLifeAdviceCard';

// ─── Daily value reference ─────────────────────────────────────────────────────

const DV = { protein: 50, carbs: 275, fat: 78 };

// ─── Macro DV bar ──────────────────────────────────────────────────────────────

const MacroBar: React.FC<{ label: string; value: number; dv: number; color: string }> = ({
  label, value, dv, color,
}) => {
  const target = Math.min(100, Math.round((value / dv) * 100));
  // Animate from 0 on mount so the bar visibly fills
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setPct(target), 100);
    return () => clearTimeout(t);
  }, [target]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{label}</span>
        <div className="flex items-center gap-2">
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>{value.toFixed(1)}g</span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 600 }}>{target}% DV</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: 'width 0.85s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
    </div>
  );
};

// ─── Health snapshot block ────────────────────────────────────────────────────

const HealthSnapshot: React.FC<{ foods: DetectedFood[]; totals: ReturnType<typeof calcTotals> }> = ({
  foods, totals,
}) => {
  const score = useMemo(() => scoreDish(foods), [foods]);

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          Health Snapshot
        </p>
      </div>
      <div className="px-4 py-4 space-y-4">
        {/* Score ring */}
        <DishScoreRing score={score} />

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

        {/* Macro DV bars */}
        <div className="space-y-3">
          <MacroBar label="Protein" value={totals.total_protein} dv={DV.protein} color="#60a5fa" />
          <MacroBar label="Carbs"   value={totals.total_carbs}   dv={DV.carbs}   color="#fbbf24" />
          <MacroBar label="Fat"     value={totals.total_fat}     dv={DV.fat}     color="#f87171" />
        </div>

        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, lineHeight: 1.5 }}>
          DV = FDA Daily Value (2 000 kcal diet)
        </p>
      </div>
    </div>
  );
};

// ─── Product type badge ───────────────────────────────────────────────────────

function TypeBadge({ type }: { type?: DetectedFood['type'] }) {
  if (!type) return null;
  const cfg: Record<NonNullable<DetectedFood['type']>, { label: string; color: string; bg: string }> = {
    whole_food:  { label: 'Fresh',      color: '#4ade80', bg: 'rgba(74,222,128,0.10)' },
    packaged:    { label: 'Packaged',   color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
    restaurant:  { label: 'Restaurant', color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
    drink:       { label: 'Drink',      color: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
  };
  const { label, color, bg } = cfg[type];
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '0.10em',
      textTransform: 'uppercase', color, background: bg,
      padding: '2px 6px', borderRadius: 4, border: `1px solid ${color}30`,
    }}>
      {label}
    </span>
  );
}

// ─── Serving editor card ──────────────────────────────────────────────────────

const ServingEditor: React.FC<{
  food: DetectedFood;
  onUpdate: (updated: DetectedFood) => void;
  onRemove: () => void;
}> = ({ food, onUpdate, onRemove }) => {
  const [qty, setQty] = useState(String(food.servings));

  const commit = () => {
    const n = parseFloat(qty);
    if (!isNaN(n) && n >= 0.1) onUpdate({ ...food, servings: n });
    else setQty(String(food.servings));
  };

  const effectiveCal = Math.round(food.calories * food.servings);

  const sourceLabel: Record<string, string> = {
    usda: 'USDA', openfoodfacts: 'OFF', fatsecret: 'FS', label: 'LABEL',
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#1a1d24', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p style={{ color: '#fff', fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{food.name}</p>
            {food.source && (
              <span style={{
                color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700,
                background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3,
                letterSpacing: '0.08em',
              }}>
                {sourceLabel[food.source] ?? food.source}
              </span>
            )}
            <TypeBadge type={food.type} />
          </div>
          {food.brand && (
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{food.brand}</p>
          )}
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 3 }}>{food.servingSize}</p>
        </div>
        <div className="text-right shrink-0">
          <p style={{ color: '#C8FF00', fontSize: 26, fontWeight: 900, lineHeight: 1 }}>{effectiveCal}</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>kcal</p>
        </div>
      </div>

      {/* Macros */}
      <div className="grid grid-cols-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { label: 'Protein', val: food.protein * food.servings, color: '#60a5fa' },
          { label: 'Carbs',   val: food.carbs   * food.servings, color: '#fbbf24' },
          { label: 'Fat',     val: food.fat      * food.servings, color: '#f87171' },
        ].map(({ label, val, color }, i, arr) => (
          <div key={label} className="text-center py-2.5"
            style={{ borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <p style={{ color, fontSize: 13, fontWeight: 800 }}>{val.toFixed(1)}g</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Servings editor */}
      <div className="flex items-center gap-2 px-4 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700 }}>Servings</p>
        <div className="flex items-center gap-1 flex-1">
          <button
            onClick={() => { const n = Math.max(0.5, food.servings - 0.5); onUpdate({ ...food, servings: n }); setQty(String(n)); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-lg font-bold transition-all active:scale-90"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>−</button>
          <input
            type="number" min={0.1} step={0.5} value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={commit}
            className="w-14 text-center text-[13px] font-bold rounded-lg h-7 focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
          />
          <button
            onClick={() => { const n = food.servings + 0.5; onUpdate({ ...food, servings: n }); setQty(String(n)); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-lg font-bold transition-all active:scale-90"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)' }}>+</button>
        </div>
        <button onClick={onRemove}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-90"
          style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
          <Trash2 className="w-3.5 h-3.5" style={{ color: '#f87171' }} />
        </button>
      </div>
    </div>
  );
};

// ─── Add food modal ───────────────────────────────────────────────────────────

const AddFoodModal: React.FC<{ onAdd: (food: DetectedFood) => void; onClose: () => void }> = ({
  onAdd, onClose,
}) => {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<DetectedFood[]>([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try { const r = await searchFood(query); setResults(r); setSearched(true); }
    catch { setResults([]); setSearched(true); }
    finally { setLoading(false); }
  };

  const sourceLabel: Record<string, string> = {
    usda: 'USDA', openfoodfacts: 'OFF', fatsecret: 'FS',
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-[480px] rounded-t-[24px] overflow-hidden pb-[max(20px,env(safe-area-inset-bottom))]"
        style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>

        <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-4" style={{ background: 'rgba(255,255,255,0.3)' }} />
        <div className="flex items-center justify-between px-5 mb-4">
          <p style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>Add Food</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>
        </div>

        <div className="flex gap-2 px-5 mb-4">
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="Search USDA, Open Food Facts, FatSecret…"
            className="flex-1 px-3 py-2.5 rounded-xl text-[13px] focus:outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', caretColor: '#C8FF00' }}
          />
          <button onClick={doSearch} disabled={loading}
            className="px-4 py-2.5 rounded-xl text-[13px] font-bold active:scale-95 transition-all disabled:opacity-50"
            style={{ background: '#C8FF00', color: '#000' }}>
            {loading ? '…' : <Search className="w-4 h-4" />}
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 space-y-2 pb-2">
          {searched && results.length === 0 && (
            <p className="text-center py-8" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              No results for "{query}"
            </p>
          )}
          {results.map((food) => (
            <button key={food.id} onClick={() => { onAdd(food); onClose(); }}
              className="w-full text-left px-4 py-3.5 rounded-2xl active:scale-[0.98] transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{food.name}</p>
                    {food.source && (
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 3 }}>
                        {sourceLabel[food.source] ?? food.source}
                      </span>
                    )}
                  </div>
                  {food.brand && <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }}>{food.brand}</p>}
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 }}>
                    {food.servingSize} · P {food.protein.toFixed(1)}g  C {food.carbs.toFixed(1)}g  F {food.fat.toFixed(1)}g
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p style={{ color: '#C8FF00', fontSize: 18, fontWeight: 900 }}>{Math.round(food.calories)}</p>
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>kcal</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Priority-aware macro tile ────────────────────────────────────────────────

const MacroTile: React.FC<{
  label: string; val: number; unit: string; color: string;
  macroKey: MacroKey; isPriority: boolean;
}> = ({ label, val, unit, color, isPriority }) => (
  <div className="rounded-xl p-3 text-center"
    style={{
      background: isPriority ? `${color}10` : 'rgba(255,255,255,0.04)',
      // Always 1.5px border — avoids 1→1.5px shift causing layout reflow
      border:   `1.5px solid ${isPriority ? `${color}55` : 'rgba(255,255,255,0.07)'}`,
      position: 'relative',
    }}>
    {isPriority && (
      <div style={{
        position: 'absolute', top: 4, right: 5,
        width: 5, height: 5, borderRadius: '50%', background: color,
      }} />
    )}
    <p style={{
      color: isPriority ? color : 'rgba(255,255,255,0.4)',
      fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em',
      marginBottom: 4, fontWeight: 700,
    }}>{label}</p>
    {/* Consistent 18px — no size jump that shifts grid height */}
    <p style={{ color, fontSize: 18, fontWeight: 900, lineHeight: 1 }}>
      {val.toFixed(1)}<span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 1 }}>{unit}</span>
    </p>
  </div>
);

// ─── Main FoodResults ─────────────────────────────────────────────────────────

interface Props {
  state: ScanState;
  onSave: (foods: DetectedFood[]) => Promise<void>;
  onScanAgain: () => void;
  saving: boolean;
}

export const FoodResults: React.FC<Props> = ({ state, onSave, onScanAgain, saving }) => {
  const [foods, setFoods]                           = useState<DetectedFood[]>(state.foods);
  const [showAddModal, setShowAdd]                  = useState(false);
  const [showPriority, setShowPriority]             = useState(false);
  const [ingredientWarnings, setIngredientWarnings] = useState<PackagedIngredientWarning[]>([]);

  const { isPriority } = useNutritionPriority();
  const totals    = useMemo(() => calcTotals(foods), [foods]);
  const dishScore = useMemo(() => scoreDish(foods),  [foods]);
  const noFood    = state.foods.length === 0 && foods.length === 0;

  useEffect(() => {
    const packaged = foods.filter((f) => f.type === 'packaged');
    if (packaged.length === 0) { setIngredientWarnings([]); return; }
    analyzePackagedIngredients(packaged).then(setIngredientWarnings).catch(() => {});
  }, [foods]);

  const updateFood = (idx: number, updated: DetectedFood) =>
    setFoods((prev) => prev.map((f, i) => (i === idx ? updated : f)));

  const removeFood = (idx: number) => setFoods((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">

      {/* No-food detected banner */}
      {noFood && (
        <div className="rounded-2xl px-5 py-5 text-center"
          style={{ background: 'rgba(250,199,117,0.06)', border: '1px solid rgba(250,199,117,0.18)' }}>
          <p style={{ color: '#FAC775', fontSize: 15, fontWeight: 800 }}>No food detected</p>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
            Couldn't identify food in this image. Add items manually below.
          </p>
        </div>
      )}

      {/* Total nutrition card */}
      {foods.length > 0 && (
        <div className="rounded-2xl p-5"
          style={{ background: 'linear-gradient(160deg,#16191F,#111419)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between mb-3">
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.18em' }}>
              Total Nutrition
            </p>
            <button onClick={() => setShowPriority(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg active:scale-95 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <SlidersHorizontal className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.5)' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700 }}>Priority</span>
            </button>
          </div>
          <div className="flex items-end gap-2 mb-4">
            <span style={{
              color: isPriority('calories') ? '#C8FF00' : '#C8FF00',
              fontSize: 56, fontWeight: 900, lineHeight: 1,
            }}>
              {totals.total_calories}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>kcal</span>
            {isPriority('calories') && (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#C8FF00', marginBottom: 10 }} />
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MacroTile label="Protein" val={totals.total_protein} unit="g" color="#60a5fa" macroKey="protein" isPriority={isPriority('protein')} />
            <MacroTile label="Carbs"   val={totals.total_carbs}   unit="g" color="#fbbf24" macroKey="carbs"   isPriority={isPriority('carbs')} />
            <MacroTile label="Fat"     val={totals.total_fat}     unit="g" color="#f87171" macroKey="fat"     isPriority={isPriority('fat')} />
          </div>
        </div>
      )}

      {/* Food cards */}
      {foods.map((food, i) => (
        <ServingEditor
          key={`${food.id}-${i}`}
          food={food}
          onUpdate={(u) => updateFood(i, u)}
          onRemove={() => removeFood(i)}
        />
      ))}

      {/* Health snapshot (only when foods exist) */}
      {foods.length > 0 && (
        <HealthSnapshot foods={foods} totals={totals} />
      )}

      {/* Packaged ingredient concerns (async — appears after Gemini analysis) */}
      {ingredientWarnings.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#fbbf24' }} />
            <p style={{ color: '#fff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Packaged Item Concerns
            </p>
          </div>
          <div className="px-4 py-3 space-y-3">
            {ingredientWarnings.map((w, wi) => (
              <div key={wi}>
                <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                  {w.foodName}
                </p>
                <div className="space-y-2">
                  {w.concerns.map((c, ci) => {
                    const col = c.concern === 'high' ? '#f87171' : c.concern === 'medium' ? '#fbbf24' : 'rgba(255,255,255,0.5)';
                    return (
                      <div key={ci} className="rounded-xl px-3 py-2.5"
                        style={{ background: `${col}10`, border: `1px solid ${col}22` }}>
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{c.name}</p>
                          <span style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                            color: col, background: `${col}22`, padding: '1px 6px', borderRadius: 4,
                          }}>
                            {c.concern.toUpperCase()}
                          </span>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.4 }}>{c.effect}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, lineHeight: 1.5 }}>
              Ingredients estimated by AI — scan the product label for exact analysis.
            </p>
          </div>
        </div>
      )}

      {/* Real-life advice */}
      {foods.length > 0 && (
        <RealLifeAdviceCard foods={foods} score={dishScore} totalCalories={totals.total_calories} />
      )}

      {/* Add food button */}
      <button onClick={() => setShowAdd(true)}
        className="w-full py-3.5 rounded-2xl text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
        <Plus className="w-4 h-4" /> Add food manually
      </button>

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button onClick={() => onSave(foods)} disabled={saving || foods.length === 0}
          className="w-full py-4 rounded-2xl text-[16px] font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          style={{ background: '#C8FF00' }}>
          <CheckCircle2 className="w-5 h-5" />
          {saving ? 'Saving…' : 'Save to History'}
        </button>
        <button onClick={onScanAgain}
          className="w-full py-4 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
          <RotateCcw className="w-4 h-4" /> Scan Again
        </button>
      </div>

      {/* Captured image strip */}
      {state.imagePreviewUrl && (
        <div className="flex items-center gap-3 rounded-2xl p-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <img src={state.imagePreviewUrl} alt="Captured" className="w-14 h-14 rounded-xl object-cover" />
          <div>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: 700 }}>Scanned image</p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 2 }}>
              {foods.length} item{foods.length !== 1 ? 's' : ''} detected
            </p>
          </div>
          <Edit3 className="w-3.5 h-3.5 ml-auto" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      )}

      {showAddModal && (
        <AddFoodModal onAdd={(f) => setFoods((p) => [...p, f])} onClose={() => setShowAdd(false)} />
      )}

      {showPriority && (
        <NutritionPrioritySheet onClose={() => setShowPriority(false)} />
      )}
    </div>
  );
};

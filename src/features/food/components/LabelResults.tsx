/**
 * LabelResults — shown when the scanned image is a nutrition facts panel.
 *
 *  1. Product name + image
 *  2. Region badge (re-scores on change)
 *  3. Health rings (region-aware)
 *  4. Ingredient concerns (banned-in-region highlighted)
 *  5. Nutrition facts table
 *  6. Standards comparison panel
 *  7. Save / Scan Again
 */

import React, { useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, AlertTriangle, ShieldCheck, Globe } from 'lucide-react';
import type { LabelData, DetectedFood, Additive } from '../types';
import { scoreLabel } from '../services/healthScore.service';
import { HealthRings } from './HealthRings';
import { NutritionFactsTable } from './NutritionFactsTable';
import { CompliancePanel } from './CompliancePanel';
import { RegionStandardSheet } from './RegionStandardSheet';
import { useRegionStandard } from '../hooks/useRegionStandard';

// ─── Ingredient concern item ────────────────────────────────────────────────

const ConcernItem: React.FC<{ concern: Additive }> = ({ concern }) => {
  const banned = concern.banned;
  const color = banned ? '#f87171' : concern.concern === 'high' ? '#f87171' : concern.concern === 'medium' ? '#fbbf24' : 'rgba(255,255,255,0.5)';
  const bg    = banned ? 'rgba(248,113,113,0.1)' : concern.concern === 'high' ? 'rgba(248,113,113,0.08)' : concern.concern === 'medium' ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)';
  const label = concern.concern === 'high' ? 'HIGH' : concern.concern === 'medium' ? 'MEDIUM' : 'LOW';

  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: bg, border: `1px solid ${color}22` }}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <p style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{concern.name}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {banned && (
            <span style={{
              color: '#fff', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
              background: '#f87171', padding: '1px 6px', borderRadius: 4,
            }}>BANNED · {concern.bannedRegionName}</span>
          )}
          <span style={{
            color, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
            background: `${color}22`, padding: '1px 6px', borderRadius: 4,
          }}>{label}</span>
        </div>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.4 }}>{concern.effect}</p>
    </div>
  );
};

// ─── Region badge ───────────────────────────────────────────────────────────

const RegionBadge: React.FC<{ flag: string; authority: string; onClick: () => void }> = ({ flag, authority, onClick }) => (
  <button onClick={onClick}
    className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl active:scale-[0.99] transition-all"
    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
    <Globe className="w-3.5 h-3.5" style={{ color: '#C8FF00' }} />
    <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
      Scored against <span style={{ color: '#fff', fontWeight: 800 }}>{flag} {authority}</span>
    </span>
    <span style={{ color: '#C8FF00', fontSize: 11, fontWeight: 700, marginLeft: 'auto' }}>Change</span>
  </button>
);

// ─── Main LabelResults ──────────────────────────────────────────────────────

interface Props {
  label: LabelData;
  imagePreviewUrl: string | null;
  onSave: (foods: DetectedFood[]) => Promise<void>;
  onScanAgain: () => void;
  saving: boolean;
}

export const LabelResults: React.FC<Props> = ({ label, imagePreviewUrl, onSave, onScanAgain, saving }) => {
  const { region, standard, comparisonRegions } = useRegionStandard();
  const [showRegion, setShowRegion] = useState(false);

  const score = useMemo(() => scoreLabel(label, region), [label, region]);

  const handleSave = () => {
    const food: DetectedFood = {
      id:           `label-${Date.now()}`,
      name:         label.productName || 'Packaged product',
      servingSize:  label.servingSize,
      servingGrams: label.servingGrams,
      servings:     1,
      calories:     label.calories,
      protein:      label.protein,
      carbs:        label.totalCarbs,
      fat:          label.totalFat,
      fiber:        label.dietaryFiber || undefined,
      sugar:        label.totalSugars  || undefined,
      source:       'label',
      labelData:    label, // persist full panel so history can show facts + compliance anytime
    };
    onSave([food]);
  };

  return (
    <div className="space-y-5">

      {/* Product name + image strip */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
        {imagePreviewUrl && (
          <img src={imagePreviewUrl} alt="Scanned product" className="w-full object-cover" style={{ maxHeight: 180, objectFit: 'cover' }} />
        )}
        <div className="px-4 py-4">
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            Nutrition Label
          </p>
          <p style={{ color: '#fff', fontSize: 20, fontWeight: 800, marginTop: 2, lineHeight: 1.2 }}>
            {label.productName || 'Product'}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
            {label.servingSize}{label.servingsPerContainer ? ` · ${label.servingsPerContainer} servings per container` : ''}
          </p>
        </div>
      </div>

      {/* Region badge */}
      <RegionBadge flag={standard.flag} authority={standard.authority} onClick={() => setShowRegion(true)} />

      {/* Health rings */}
      <div className="rounded-2xl px-5 py-6" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
        <HealthRings score={score} />
      </div>

      {/* Ingredient concerns */}
      {score.concerns.length > 0 ? (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: score.concerns.some((c) => c.concern === 'high') ? '#f87171' : '#fbbf24' }} />
            <p style={{ color: '#fff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {score.concerns.length} Ingredient {score.concerns.length === 1 ? 'Concern' : 'Concerns'}
            </p>
          </div>
          <div className="px-4 py-3 space-y-2">
            {score.concerns.map((c, i) => <ConcernItem key={i} concern={c} />)}
          </div>
          {label.ingredients && (
            <div className="px-4 pb-4">
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Ingredients
              </p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.6 }}>{label.ingredients}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl px-4 py-4 flex items-center gap-3"
          style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)' }}>
          <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: '#4ade80' }} />
          <div>
            <p style={{ color: '#4ade80', fontSize: 13, fontWeight: 800 }}>No Concerning Additives</p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>
              No high-concern chemicals detected in the ingredients list.
            </p>
          </div>
        </div>
      )}

      {/* Nutrition facts table */}
      <NutritionFactsTable label={label} />

      {/* Standards comparison */}
      <CompliancePanel label={label} userRegion={region} comparisonRegions={comparisonRegions} />

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button onClick={handleSave} disabled={saving}
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

      {showRegion && <RegionStandardSheet mode="settings" onClose={() => setShowRegion(false)} />}
    </div>
  );
};

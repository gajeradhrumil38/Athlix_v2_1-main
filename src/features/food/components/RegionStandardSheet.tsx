/**
 * RegionStandardSheet — pick your regulatory region (re-scores all food) and, in settings
 * mode, the comparison standards shown on the nutrition page.
 *
 *  mode="onboarding" — first run; not dismissible without choosing.
 *  mode="settings"   — re-openable anytime; dismissible.
 */

import React from 'react';
import { X, Check, Globe } from 'lucide-react';
import type { Region } from '../types';
import { REGION_ORDER, REGION_STANDARDS } from '../services/regionStandards';
import { useRegionStandard } from '../hooks/useRegionStandard';

interface Props {
  mode: 'onboarding' | 'settings';
  onClose: () => void;
}

export const RegionStandardSheet: React.FC<Props> = ({ mode, onClose }) => {
  const {
    region, setRegion, hasChosenRegion,
    comparisonRegions, setComparisonRegions, maxComparison,
  } = useRegionStandard();

  const isOnboarding = mode === 'onboarding';
  const showCurrent  = hasChosenRegion || mode === 'settings';

  const pickRegion = (r: Region) => {
    setRegion(r);
    if (isOnboarding) onClose(); // choosing dismisses the one-time popup
  };

  const toggleComparison = (r: Region) => {
    if (comparisonRegions.includes(r)) {
      setComparisonRegions(comparisonRegions.filter((x) => x !== r));
    } else if (comparisonRegions.length < maxComparison) {
      setComparisonRegions([...comparisonRegions, r]);
    }
  };

  return (
    <div className="fixed inset-0 z-[360] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}
      onClick={isOnboarding ? undefined : onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-[24px] overflow-y-auto no-scrollbar pb-[max(24px,env(safe-area-inset-bottom))]"
        style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh' }}>

        <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-4" style={{ background: 'rgba(255,255,255,0.3)' }} />

        {/* Header */}
        <div className="flex items-start justify-between px-5 mb-2">
          <div className="flex-1 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4" style={{ color: '#C8FF00' }} />
              <p style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>
                {isOnboarding ? 'Set Your Region' : 'Food Safety Region'}
              </p>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.5 }}>
              {isOnboarding
                ? 'Pick your region so we score food against the right safety standards. You can change this anytime in settings.'
                : 'Food is scored against this region’s official limits and banned-additive list.'}
            </p>
          </div>
          {!isOnboarding && (
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)' }}>
              <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
            </button>
          )}
        </div>

        {/* Region list */}
        <div className="px-5 pt-3 space-y-2">
          {REGION_ORDER.map((r) => {
            const std = REGION_STANDARDS[r];
            const active = showCurrent && region === r;
            return (
              <button key={r} onClick={() => pickRegion(r)}
                className="w-full text-left rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-all"
                style={{
                  background: active ? 'rgba(200,255,0,0.08)' : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${active ? '#C8FF00' : 'rgba(255,255,255,0.08)'}`,
                }}>
                <span style={{ fontSize: 26 }}>{std.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>{std.name}</p>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600 }}>{std.authority}</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{std.tagline}</p>
                </div>
                {active && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: '#C8FF00' }}>
                    <Check className="w-3.5 h-3.5" style={{ color: '#000' }} strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Comparison standards (settings only) */}
        {!isOnboarding && (
          <div className="px-5 pt-6">
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>Compare against</p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2, marginBottom: 12, lineHeight: 1.5 }}>
              Up to {maxComparison} extra standards shown on each product ({comparisonRegions.length}/{maxComparison}).
              Your region is always compared; a product is never checked against its own making-standard.
            </p>
            <div className="flex flex-wrap gap-2">
              {REGION_ORDER.map((r) => {
                const std = REGION_STANDARDS[r];
                const on = comparisonRegions.includes(r);
                const disabled = !on && comparisonRegions.length >= maxComparison;
                return (
                  <button key={r} onClick={() => toggleComparison(r)} disabled={disabled}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl active:scale-95 transition-all disabled:opacity-35"
                    style={{
                      background: on ? 'rgba(200,255,0,0.1)' : 'rgba(255,255,255,0.05)',
                      border: `1.5px solid ${on ? '#C8FF00' : 'rgba(255,255,255,0.1)'}`,
                    }}>
                    <span style={{ fontSize: 15 }}>{std.flag}</span>
                    <span style={{ color: on ? '#C8FF00' : 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: 700 }}>
                      {std.authority}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Onboarding footer hint */}
        {isOnboarding && (
          <p className="px-5 pt-5 text-center" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
            Tap a region to continue
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * CompliancePanel — at the end of a nutrition facts page.
 * Shows the product's detected standard, then a deduplicated verdict row per standard
 * (your region + chosen comparisons), each ✓ Meets or ✗ with violations.
 * Never compares a product against the standard it was made to.
 */

import React, { useMemo } from 'react';
import { ShieldCheck, AlertTriangle, Scale } from 'lucide-react';
import type { LabelData, Region, ComplianceResult } from '../types';
import { buildComparisonStandards, checkCompliance } from '../services/healthScore.service';
import { REGION_STANDARDS } from '../services/regionStandards';

interface Props {
  label: LabelData;
  userRegion: Region;
  comparisonRegions: Region[];
}

const VerdictRow: React.FC<{ result: ComplianceResult }> = ({ result }) => {
  const std = REGION_STANDARDS[result.region];
  return (
    <div className="rounded-xl px-3 py-3"
      style={{
        background: result.meets ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
        border: `1px solid ${result.meets ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
      }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: 16 }}>{std.flag}</span>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 800 }}>{std.authority}</span>
          {result.isUserRegion && (
            <span style={{
              color: '#C8FF00', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em',
              background: 'rgba(200,255,0,0.12)', padding: '1px 6px', borderRadius: 4,
            }}>YOUR REGION</span>
          )}
        </div>
        {result.meets ? (
          <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 800 }}>✓ Meets</span>
        ) : (
          <span style={{ color: '#f87171', fontSize: 12, fontWeight: 800 }}>
            ✗ {result.violations.length} violation{result.violations.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {!result.meets && (
        <div className="mt-2 space-y-1">
          {result.violations.map((v, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span style={{ color: v.severity === 'high' ? '#f87171' : '#fbbf24', fontSize: 11, lineHeight: 1.5 }}>•</span>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 1.5 }}>
                <span style={{ color: '#fff', fontWeight: 700 }}>{v.field}</span> — {v.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const CompliancePanel: React.FC<Props> = ({ label, userRegion, comparisonRegions }) => {
  const productStandard = label.detectedStandard ?? 'unknown';

  const results = useMemo<ComplianceResult[]>(() => {
    const regions = buildComparisonStandards({
      userRegion,
      productStandard,
      chosen: comparisonRegions,
    });
    return regions.map((r) => ({
      ...checkCompliance(label, r),
      isUserRegion: r === userRegion,
    }));
  }, [label, userRegion, comparisonRegions, productStandard]);

  const productStd = productStandard !== 'unknown' ? REGION_STANDARDS[productStandard] : null;
  const allMeet = results.every((r) => r.meets);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Scale className="w-4 h-4" style={{ color: allMeet ? '#4ade80' : '#fbbf24' }} />
        <p style={{ color: '#fff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Standards Comparison
        </p>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Product origin standard */}
        <div className="flex items-center gap-2">
          {productStd ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
                Product made to <span style={{ color: '#fff', fontWeight: 800 }}>{productStd.flag} {productStd.authority}</span>
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.35)' }} />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Product standard: not detected</p>
            </>
          )}
        </div>

        {/* Verdict rows */}
        {results.map((r) => <VerdictRow key={r.region} result={r} />)}

        {productStd && (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, lineHeight: 1.5 }}>
            A product made to {productStd.authority} isn't re-checked against itself — only against other standards.
          </p>
        )}
      </div>
    </div>
  );
};

import React, { useMemo } from 'react';
import type { TraineeDashboard } from '../../../lib/coachData';
import { muscleColor } from '../../../lib/muscleColors';
import { palette } from '../../../theme/colors';
import { GlowSparkline, PlotGrid } from '../../shared/GlowChart';
import {
  bodyWeightSeries, exerciseSeries, matchExercise, muscleSets, weekStats, weeklyVolume, type AiVisual as Visual,
} from '../../../lib/traineeAiVisuals';
import { BigNumber, Delta, IDENTITY, tile } from './Widget';

// One chart attached to an Ask AI answer — same chart family and identity
// colours as the Overview cards, sized down to sit inside the chat.

const Panel: React.FC<{ title: string; tone: string; meta?: string; children: React.ReactNode }> = ({ title, tone, meta, children }) => (
  <div className="rounded-2xl p-3" style={tile()}>
    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] truncate" style={{ color: tone }}>
      {title}{meta && <span className="normal-case tracking-normal font-semibold text-[var(--text-secondary)] opacity-80">· {meta}</span>}
    </p>
    {children}
  </div>
);

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

export const AiVisual: React.FC<{ visual: Visual; dash: TraineeDashboard }> = ({ visual, dash }) => {
  const workouts = dash.workouts.shared ? dash.workouts.data : [];

  const body = useMemo(() => {
    switch (visual.kind) {
      case 'exercise': {
        const name = matchExercise(workouts, visual.name);
        if (!name) return null;
        const pts = exerciseSeries(workouts, name);
        if (!pts.length) return null;
        const last = pts[pts.length - 1].value;
        // The recorded PR can predate the sessions shared here, so prefer it.
        const pr = dash.prs.shared ? dash.prs.data.find((p) => p.exercise_name === name) : undefined;
        const best = Math.max(...pts.map((p) => p.value), pr ? Math.round(pr.best_weight) : 0);
        return (
          <Panel title={name} tone={IDENTITY.load} meta="top weight">
            <div className="flex items-end justify-between gap-2 mb-2">
              <BigNumber value={last} unit="lb" size="md" unitColor={IDENTITY.load} />
              <span className="text-right text-[11px] font-semibold text-[var(--text-secondary)] leading-snug">
                {pr ? 'PR' : 'Best'} {best} lb<br />{pts.length} session{pts.length === 1 ? '' : 's'}
              </span>
            </div>
            <PlotGrid accent={palette.accent}><GlowSparkline points={pts} color={palette.accent} unit=" lb" height={90} showTrend /></PlotGrid>
          </Panel>
        );
      }
      case 'volume': {
        const pts = weeklyVolume(workouts);
        if (pts.every((p) => p.value === 0)) return null;
        const now = pts[pts.length - 1].value;
        return (
          <Panel title="Training volume" tone={IDENTITY.load} meta="8 weeks">
            <div className="flex items-end justify-between gap-2 mb-2">
              <BigNumber value={now.toLocaleString()} unit="lb" size="md" unitColor={IDENTITY.load} />
              <Delta pct={pct(now, pts[pts.length - 2].value)} />
            </div>
            <PlotGrid accent={palette.accent}><GlowSparkline points={pts} color={palette.accent} unit=" lb" height={90} showTrend /></PlotGrid>
          </Panel>
        );
      }
      case 'bodyweight': {
        if (!dash.bodyWeight.shared) return null;
        const pts = bodyWeightSeries(dash);
        if (!pts.length) return null;
        const last = pts[pts.length - 1].value;
        const change = Math.round((last - pts[0].value) * 10) / 10;
        return (
          <Panel title="Body weight" tone={IDENTITY.weight} meta={`since ${pts[0].label}`}>
            <div className="flex items-end justify-between gap-2 mb-2">
              <BigNumber value={last} unit="lb" size="md" unitColor={IDENTITY.weight} />
              <span className="text-[12px] font-semibold text-[var(--text-secondary)]">{change > 0 ? '+' : ''}{change} lb</span>
            </div>
            <PlotGrid accent={palette.ringVolume}><GlowSparkline points={pts} color={palette.ringVolume} unit=" lb" height={90} /></PlotGrid>
          </Panel>
        );
      }
      case 'muscles': {
        const rows = muscleSets(workouts);
        if (!rows.length) return null;
        const max = rows[0].sets;
        return (
          <Panel title="Sets per muscle" tone={muscleColor(rows[0].muscle)} meta="last 7 days">
            <div className="space-y-1.5">
              {rows.slice(0, 8).map((r) => (
                <div key={r.muscle} className="flex items-center gap-2 text-[12px]">
                  <span className="w-[72px] shrink-0 truncate font-semibold text-[var(--text-primary)]">{r.muscle}</span>
                  <span className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)' }}>
                    <span className="block h-full rounded-full" style={{ width: `${(r.sets / max) * 100}%`, background: muscleColor(r.muscle) }} />
                  </span>
                  <span className="w-6 text-right tabular-nums text-[var(--text-secondary)]">{r.sets}</span>
                </div>
              ))}
            </div>
          </Panel>
        );
      }
      case 'week': {
        const { thisWeek: t, lastWeek: l } = weekStats(workouts);
        const cells = [
          { label: 'Sessions', v: t.sessions, d: pct(t.sessions, l.sessions) },
          { label: 'Sets', v: t.sets, d: pct(t.sets, l.sets) },
          { label: 'Volume', v: t.volume.toLocaleString(), d: pct(t.volume, l.volume), unit: 'lb' },
        ];
        return (
          <Panel title="This week vs last" tone={IDENTITY.consistency}>
            <div className="grid grid-cols-3 gap-2">
              {cells.map((c) => (
                <div key={c.label}>
                  <BigNumber value={c.v} unit={c.unit} size="sm" unitColor={IDENTITY.consistency} />
                  <p className="text-[11px] font-semibold text-[var(--text-secondary)] mt-0.5">{c.label}</p>
                  <div className="mt-0.5 text-[11px]"><Delta pct={c.d} suffix="" /></div>
                </div>
              ))}
            </div>
          </Panel>
        );
      }
      case 'prs': {
        if (!dash.prs.shared || !dash.prs.data.length) return null;
        const prs = [...dash.prs.data].sort((a, b) => b.achieved_date.localeCompare(a.achieved_date)).slice(0, 5);
        return (
          <Panel title="Personal records" tone={IDENTITY.records} meta="latest">
            <div className="space-y-1.5">
              {prs.map((p) => (
                <div key={p.exercise_name} className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="truncate font-semibold text-[var(--text-primary)]">{p.exercise_name}</span>
                  <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
                    <span className="font-bold" style={{ color: IDENTITY.records }}>{Math.round(p.best_weight)} lb</span> × {p.best_reps}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        );
      }
    }
  }, [visual, dash, workouts]);

  return body;
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  startOfMonth, endOfMonth, subMonths, addMonths,
  eachWeekOfInterval, endOfWeek, format,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { parseDateAtStartOfDay } from '../../lib/dates';
import { isWeightUnit } from '../../lib/units';
import { getPersonalRecords, type LocalPersonalRecord } from '../../lib/supabaseData';
import { palette } from '../../theme/colors';

interface ExerciseRadialChartProps {
  userId: string;
  exercises: any[]; // full history rows, already unit-converted by the parent (Progress.tsx)
  weightUnit: 'kg' | 'lbs';
}

// Extends the app's core muscle palette with the extra groups that show up
// in real exercise data but aren't in theme/colors.ts's smaller set —
// matches the same fallback list ExerciseHistorySearch used before it.
const MUSCLE_COLORS: Record<string, string> = {
  Chest: palette.chest, Back: palette.back, Legs: palette.legs,
  Shoulders: palette.shoulders, Core: palette.core, Biceps: palette.biceps,
  Triceps: palette.triceps, Arms: palette.biceps, Cardio: palette.cardio,
  Glutes: '#F4B96A', Forearms: '#98D4E8', Mobility: '#85C9B0', Yoga: '#7CB9C8',
};
const FALLBACK_COLOR = palette.accent;
const muscleColor = (m: string) => MUSCLE_COLORS[m] || FALLBACK_COLOR;

/* ── Geometry helpers ─────────────────────────────────────────────── */

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
}

let _measureCtx: CanvasRenderingContext2D | null = null;
function measureCtx(fontPx: number, weight: number): CanvasRenderingContext2D {
  if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d')!;
  _measureCtx.font = `${weight} ${fontPx}px Inter, ui-sans-serif, sans-serif`;
  return _measureCtx;
}

interface CurvedChar { char: string; x: number; y: number; rot: number; }

// Lays out text along a circular arc using real measured glyph widths (canvas
// measureText) converted to angular width at the given radius, so spacing
// between letters is even and proportional instead of a flat per-char guess —
// this is what keeps a wedge's label actually inside its own wedge instead of
// drifting past its boundary the way a naive equal-angle-per-char split does.
function curvedLabel(
  text: string, cx: number, cy: number, radius: number, midAngle: number, fontSizePx: number, weight: number,
): { chars: CurvedChar[]; total: number } {
  const ctx = measureCtx(fontSizePx, weight);
  const widths = text.split('').map((ch) => ctx.measureText(ch === ' ' ? ' ' : ch).width);
  const letterSpacingPx = fontSizePx * 0.03;
  const anglePerPx = 180 / Math.PI / radius;
  const charDegs = widths.map((w) => (w + letterSpacingPx) * anglePerPx);
  const total = charDegs.reduce((a, b) => a + b, 0);
  const flip = midAngle > 90 && midAngle < 270;
  let acc = 0;
  const centers = charDegs.map((d) => { const c = acc + d / 2; acc += d; return c; });
  const chars = text.split('').map((ch, i) => {
    const off = flip ? total / 2 - centers[i] : -total / 2 + centers[i];
    const angle = midAngle + off;
    const [x, y] = polar(cx, cy, radius, angle);
    return { char: ch === ' ' ? ' ' : ch, x, y, rot: flip ? angle + 180 : angle };
  });
  return { chars, total };
}

// Shrinks font size until the curved label's angular span fits within
// maxSpanDeg (with margin), so a long exercise name in a narrow wedge still
// reads as "inside" that wedge instead of overflowing into its neighbor.
function fitCurvedLabel(
  text: string, cx: number, cy: number, radius: number, midAngle: number,
  maxSpanDeg: number, maxFontPx: number, minFontPx: number, weight: number,
) {
  let fontPx = maxFontPx;
  let result = curvedLabel(text, cx, cy, radius, midAngle, fontPx, weight);
  while (result.total > maxSpanDeg * 0.88 && fontPx > minFontPx) {
    fontPx -= 0.5;
    result = curvedLabel(text, cx, cy, radius, midAngle, fontPx, weight);
  }
  return { ...result, fontPx, fits: result.total <= maxSpanDeg * 0.92 };
}

// Smooth cubic-bezier path through points (Catmull-Rom -> Bezier), for a
// minimal, non-jagged trend line.
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeInOutCubic(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function shade(hex: string, amt: number): string {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

const SHADE_STEPS = [0.32, 0.05, -0.18, -0.4];

/* ── Real-data model ──────────────────────────────────────────────── */

interface ExSet { reps: number; weight: number; }
interface ExSession { workoutId: string; name: string; muscleGroup: string | null; date: string; sets: ExSet[]; }

function buildAllSessions(exercises: any[]): ExSession[] {
  const byKey = new Map<string, ExSession>();
  exercises.forEach((ex) => {
    const date = ex.workouts?.date;
    if (!date || !ex.name || !isWeightUnit(ex.unit)) return;
    const key = `${ex.workout_id}::${ex.name}`;
    if (!byKey.has(key)) {
      byKey.set(key, { workoutId: ex.workout_id, name: ex.name, muscleGroup: ex.muscle_group ?? null, date, sets: [] });
    }
    byKey.get(key)!.sets.push({ reps: Number(ex.reps) || 0, weight: Number(ex.weight) || 0 });
  });
  return Array.from(byKey.values()).sort((a, b) => a.date.localeCompare(b.date));
}

const sessionTopSet = (s: ExSession): ExSet =>
  s.sets.reduce((best, x) => (x.weight > best.weight || (x.weight === best.weight && x.reps > best.reps) ? x : best), s.sets[0]);
const sessionVolume = (s: ExSession): number => s.sets.reduce((sum, x) => sum + x.reps * x.weight, 0);

interface HistoryPoint { date: string; sets: number; reps: number; weight: number; volume: number; }
interface DayEntry {
  key: string; name: string; date: string; dateLabel: string;
  sets: number; reps: number; weight: number;
  pr: boolean; trend: 'up' | 'down' | 'same'; trendPct: number; freq: string;
  history: HistoryPoint[];
}
interface WeekBucket { key: string; label: string; days: DayEntry[]; }
type MuscleData = Record<string, { weeks: WeekBucket[] }>;

const relativeDateLabel = (dateStr: string): string => {
  const d = parseDateAtStartOfDay(dateStr);
  if (!d) return dateStr;
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return format(d, 'MMM d');
};

// Builds the muscle -> week -> exercise-session hierarchy for one month,
// pulling real history for each exercise from ALL of the user's logged
// data (not just this month) so the mini trend chart can show as much past
// data as actually exists, capped only for chart readability.
function buildMonthData(
  allSessions: ExSession[], monthStart: Date, monthEnd: Date, personalRecords: LocalPersonalRecord[],
): MuscleData {
  const inMonth = allSessions.filter((s) => {
    const d = parseDateAtStartOfDay(s.date);
    return Boolean(d && d >= monthStart && d <= monthEnd);
  });
  const byMuscle = new Map<string, ExSession[]>();
  inMonth.forEach((s) => {
    const mg = s.muscleGroup || 'Other';
    if (!byMuscle.has(mg)) byMuscle.set(mg, []);
    byMuscle.get(mg)!.push(s);
  });

  const weekStarts = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 });
  const prByName = new Map(personalRecords.map((p) => [p.exercise_name, p]));

  const data: MuscleData = {};
  byMuscle.forEach((sessions, muscleGroup) => {
    const weeks: WeekBucket[] = weekStarts
      .map((weekStart, wi) => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const weekSessions = sessions.filter((s) => {
          const d = parseDateAtStartOfDay(s.date)!;
          return d >= weekStart && d <= weekEnd;
        });
        const days: DayEntry[] = weekSessions.map((s) => {
          const fullHistory = allSessions.filter((h) => h.name === s.name && h.date <= s.date).slice(-8);
          const top = sessionTopSet(s);
          const prevOcc = fullHistory.length >= 2 ? fullHistory[fullHistory.length - 2] : null;
          const prevVol = prevOcc ? sessionVolume(prevOcc) : null;
          const curVol = sessionVolume(s);
          const trend: DayEntry['trend'] = prevVol == null ? 'same' : curVol > prevVol ? 'up' : curVol < prevVol ? 'down' : 'same';
          const trendPct = prevVol ? Math.round(((curVol - prevVol) / prevVol) * 100) : 0;
          const freqCount = weekSessions.filter((ws) => ws.name === s.name).length;
          const pr = prByName.get(s.name);
          return {
            key: `${s.workoutId}::${s.name}`,
            name: s.name,
            date: s.date,
            dateLabel: relativeDateLabel(s.date),
            sets: s.sets.length,
            reps: top.reps,
            weight: top.weight,
            pr: !!pr && pr.achieved_date === s.date && pr.best_weight === top.weight && pr.best_reps === top.reps,
            trend, trendPct,
            freq: `${freqCount}x this week`,
            history: fullHistory.map((h) => {
              const ht = sessionTopSet(h);
              return { date: h.date, sets: h.sets.length, reps: ht.reps, weight: ht.weight, volume: sessionVolume(h) };
            }),
          };
        });
        return { key: `w${wi}`, label: `Week of ${format(weekStart, 'MMM d')}`, days };
      })
      .filter((w) => w.days.length > 0);
    data[muscleGroup] = { weeks };
  });
  return data;
}

const dayVolume = (d: DayEntry) => d.sets * d.reps * d.weight;
const weekVolume = (w: WeekBucket) => w.days.reduce((s, d) => s + dayVolume(d), 0);
const muscleVolume = (m: { weeks: WeekBucket[] }) => m.weeks.reduce((s, w) => s + weekVolume(w), 0);

/* ── Arc-segment rendering (pure, ported from the design reference) ─ */

interface ArcVisual { path: string; fill: string; opacity: number; stroke: string; strokeWidth: number; onClick: (() => void) | null; style: React.CSSProperties; }
interface LabelVisual { char: string; x: number; y: number; rot: number; style: React.CSSProperties; }
interface LeaderVisual { dotColor: string; style: React.CSSProperties; textAlign: 'left' | 'right'; labelX: number; labelY: number; translateX: string; text: string; pct: number; line: string; }
interface DividerVisual { path: string; opacity: number; }

interface Segment { key: string; label: string; color: string; volume: number; isSelected: boolean; onClick: () => void; }

function renderArc(
  segments: Segment[], cx: number, cy: number, inner: number, outer: number, gapDeg: number, revealed: boolean, fontSizePx: number,
): { arcs: ArcVisual[]; labels: LabelVisual[]; leaders: LeaderVisual[] } {
  const total = segments.reduce((s, x) => s + x.volume, 0) || 1;
  const availableDeg = 360 - gapDeg * segments.length;
  const labelRadius = (inner + outer) / 2;
  let cursor = 0;
  const arcs: ArcVisual[] = [];
  const labels: LabelVisual[] = [];
  const leaderCandidates: Array<{ x1: number; y1: number; naturalY: number; dxSign: number; dotColor: string; style: React.CSSProperties; text: string; pct: number }> = [];
  // Bounding box (with a little padding) around each curved in-wedge label,
  // built from the actual measured positions of its characters — used below
  // to keep leader labels from landing on top of a neighboring wedge's text.
  type Box = { minX: number; maxX: number; minY: number; maxY: number };
  const curvedBoxes: Box[] = [];

  segments.forEach((seg, i) => {
    const span = (seg.volume / total) * availableDeg;
    const a0 = cursor + gapDeg / 2;
    const a1 = a0 + span;
    const midAngle = (a0 + a1) / 2;
    cursor += span + gapDeg;
    const baseOpacity = !segments.some((s) => s.isSelected) || seg.isSelected ? 1 : 0.45;
    const delay = i * 26;
    arcs.push({
      path: arcPath(cx, cy, inner, outer, a0, a1),
      fill: seg.color,
      opacity: revealed ? baseOpacity : 0,
      stroke: seg.isSelected ? '#ffffff' : 'none',
      strokeWidth: seg.isSelected ? 1.5 : 0,
      onClick: seg.onClick,
      style: {
        transformOrigin: '150px 150px',
        transition: `opacity 0.32s ease ${delay}ms, transform 0.38s cubic-bezier(.22,.85,.25,1) ${delay}ms`,
        transform: revealed ? 'scale(1)' : 'scale(0.9)',
        cursor: 'pointer',
      },
    });
    const name = seg.label.toUpperCase();
    const fit = fitCurvedLabel(name, cx, cy, labelRadius, midAngle, span, fontSizePx, fontSizePx - 2, 800);
    const style: React.CSSProperties = { opacity: revealed ? baseOpacity : 0, transition: `opacity 0.28s ease ${delay + 90}ms` };
    const pct = Math.round((seg.volume / total) * 100);
    if (span >= 15 && fit.fits) {
      const chStyle: React.CSSProperties = { ...style, fontSize: fit.fontPx, fontWeight: 800 };
      const pad = fit.fontPx * 0.7;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      fit.chars.forEach((c) => {
        labels.push({ char: c.char, x: c.x, y: c.y, rot: c.rot, style: chStyle });
        minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
      });
      if (fit.chars.length) curvedBoxes.push({ minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad });
    } else if (pct >= 2) {
      // Sub-2% slices get a color in the ring and count toward the total,
      // but skip the leader label entirely — with real data (a dozen+
      // muscle groups instead of the design reference's tidy demo set),
      // labeling every sliver just adds clutter no one can read anyway.
      const r1 = outer + 40;
      const [x1, y1] = polar(cx, cy, r1, midAngle);
      const isBottomHalf = midAngle > 90 && midAngle < 270;
      const dxSign = isBottomHalf ? -1 : 1;
      leaderCandidates.push({ x1, y1, naturalY: y1, dxSign, dotColor: seg.color, style, text: seg.label, pct });
    }
  });

  // Second pass: on each side (left/right), resolve vertical overlap with a
  // two-pass (forward, then backward) compression — a standard label-
  // declutter technique (the same idea behind dedicated label-placement
  // libraries like stirpie/d3-annotation-style leader systems). A single
  // forward-only pass (push each label at least MIN_GAP below the
  // previous, then clamp to the canvas edge) looks fine with 2-3 items,
  // but once several small wedges cluster in one angular region — which
  // real, uneven muscle-group data does constantly, unlike the reference's
  // evenly-split demo — clamping alone collapses every item past the edge
  // onto the SAME clamped position. The backward pass re-spaces everything
  // from the bottom up so items compress toward each other instead of
  // stacking on top of one another.
  const MIN_GAP = 15, TOP = 10, BOTTOM = 290;
  const leaders: LeaderVisual[] = [];
  (['left', 'right'] as const).forEach((side) => {
    const group = leaderCandidates.filter((c) => (side === 'right' ? c.dxSign > 0 : c.dxSign < 0)).sort((a, b) => a.naturalY - b.naturalY);
    if (!group.length) return;

    const forwardY: number[] = [];
    let prevY = -Infinity;
    group.forEach((c) => {
      const y = Math.max(c.naturalY, prevY + MIN_GAP);
      forwardY.push(y);
      prevY = y;
    });

    const finalY: number[] = new Array(group.length);
    let nextY = Infinity;
    for (let i = group.length - 1; i >= 0; i--) {
      const capped = i === group.length - 1 ? Math.min(forwardY[i], BOTTOM) : Math.min(forwardY[i], nextY - MIN_GAP);
      finalY[i] = capped;
      nextY = capped;
    }
    finalY.forEach((y, i) => { finalY[i] = Math.max(TOP, Math.min(BOTTOM, y)); });

    group.forEach((c, i) => {
      const y = finalY[i];
      const estWidth = c.text.length * 6.2 + 6;
      const estHeight = 13;
      const SAFE_L = -45, SAFE_R = 350;

      // Third pass: even after vertical decluttering against OTHER leader
      // labels, a seam-adjacent wedge's leader can still land inside a
      // neighboring wedge's in-wedge curved-label box (they're resolved
      // completely independently up to this point). Check this label's
      // actual bounding box against every curved label's real measured
      // box and, on overlap, push it further from the ring in its own
      // outward direction — the same "detect a real intersection, then
      // nudge" idea dedicated label-placement libraries (e.g. stirpie's
      // RBush-based resolver) use, just without pulling in a spatial-index
      // dependency for a handful of labels.
      let pushOut = 0;
      for (let attempt = 0; attempt < 6; attempt++) {
        const labelX = c.x1 + c.dxSign * (24 + pushOut);
        const boxMinX = c.dxSign > 0 ? labelX : labelX - estWidth;
        const boxMaxX = c.dxSign > 0 ? labelX + estWidth : labelX;
        const boxMinY = y - estHeight / 2, boxMaxY = y + estHeight / 2;
        const collides = curvedBoxes.some((b) => boxMinX < b.maxX && boxMaxX > b.minX && boxMinY < b.maxY && boxMaxY > b.minY);
        if (!collides) break;
        pushOut += 16;
      }

      let labelX = c.x1 + c.dxSign * (24 + pushOut);
      if (c.dxSign > 0) labelX = Math.min(labelX, SAFE_R - estWidth);
      else labelX = Math.max(labelX, SAFE_L + estWidth);
      const translateX = c.dxSign > 0 ? '0%' : '-100%';
      const lineEndX = labelX - c.dxSign * 12;
      const nubX = c.x1 + (lineEndX - c.x1) * 0.4;
      const line = `M${c.x1},${c.y1} L${nubX},${c.y1} L${nubX},${y} L${lineEndX},${y}`;
      leaders.push({ dotColor: c.dotColor, style: c.style, textAlign: c.dxSign > 0 ? 'left' : 'right', labelX, labelY: y, translateX, text: c.text, pct: c.pct, line });
    });
  });
  return { arcs, labels, leaders };
}

function renderDaySegments(
  daySegs: Array<{ key: string; label: string; color: string; volume: number; angleStart: number; angleSpan: number; sets: number; isSelected: boolean; onClick: () => void }>,
  cx: number, cy: number, revealed: boolean,
): { arcs: ArcVisual[]; labels: LabelVisual[]; dividers: DividerVisual[] } {
  const inner = 76, outer = 140, labelRadius = (inner + outer) / 2;
  const arcs: ArcVisual[] = [], labels: LabelVisual[] = [], dividers: DividerVisual[] = [];
  daySegs.forEach((seg, i) => {
    const a0 = seg.angleStart, a1 = seg.angleStart + seg.angleSpan;
    const midAngle = (a0 + a1) / 2;
    const baseOpacity = !daySegs.some((s) => s.isSelected) || seg.isSelected ? 1 : 0.45;
    const delay = i * 26 + 40;
    arcs.push({
      path: arcPath(cx, cy, inner, outer, a0, a1),
      fill: seg.color,
      opacity: revealed ? baseOpacity : 0,
      stroke: seg.isSelected ? '#ffffff' : 'none',
      strokeWidth: seg.isSelected ? 1.5 : 0,
      onClick: seg.onClick,
      style: {
        transformOrigin: '150px 150px',
        transition: `opacity 0.32s ease ${delay}ms, transform 0.38s cubic-bezier(.22,.85,.25,1) ${delay}ms`,
        transform: revealed ? 'scale(1)' : 'scale(0.9)',
        cursor: 'pointer',
      },
    });
    const hasName = seg.angleSpan >= 13;
    if (seg.sets > 1 && seg.angleSpan >= 10) {
      const setSpan = seg.angleSpan / seg.sets;
      const nameR = labelRadius + 10, gapHalf = 9;
      for (let s = 1; s < seg.sets; s++) {
        const ang = a0 + setSpan * s;
        const opacity = revealed ? baseOpacity * 0.3 : 0;
        if (hasName) {
          const [x0, y0] = polar(cx, cy, inner, ang);
          const [x1, y1] = polar(cx, cy, nameR - gapHalf, ang);
          const [x2, y2] = polar(cx, cy, nameR + gapHalf, ang);
          const [x3, y3] = polar(cx, cy, outer, ang);
          dividers.push({ path: `M${x0},${y0} L${x1},${y1}`, opacity });
          dividers.push({ path: `M${x2},${y2} L${x3},${y3}`, opacity });
        } else {
          const [x0, y0] = polar(cx, cy, inner, ang);
          const [x1, y1] = polar(cx, cy, outer, ang);
          dividers.push({ path: `M${x0},${y0} L${x1},${y1}`, opacity });
        }
      }
    }
    if (hasName) {
      const name = seg.label.toUpperCase();
      const nameRadius = labelRadius + 10;
      const fit = fitCurvedLabel(name, cx, cy, nameRadius, midAngle, seg.angleSpan, 9.5, 6.5, 800);
      const style: React.CSSProperties = { opacity: revealed ? baseOpacity : 0, transition: `opacity 0.28s ease ${delay + 90}ms`, fontSize: fit.fontPx, fontWeight: 800 };
      if (fit.fits) fit.chars.forEach((c) => labels.push({ char: c.char, x: c.x, y: c.y, rot: c.rot, style }));
    }
  });
  return { arcs, labels, dividers };
}

/* ── Component ────────────────────────────────────────────────────── */

interface TransitionFrame { color: string; from: { a0: number; a1: number; r0: number; r1: number; opacity: number }; to: { a0: number; a1: number; r0: number; r1: number; opacity: number }; }
interface TransitionState { frames: TransitionFrame[]; start: number; duration: number; dir: 'in' | 'out'; key: string; progress: number; }

export const ExerciseRadialChart: React.FC<ExerciseRadialChartProps> = ({ userId, exercises, weightUnit }) => {
  const [monthOffset, setMonthOffset] = useState(0);
  const [path, setPath] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [personalRecords, setPersonalRecords] = useState<LocalPersonalRecord[]>([]);
  const [, setTick] = useState(0);
  const transitionRef = useRef<TransitionState | null>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    getPersonalRecords(userId).then(setPersonalRecords).catch(() => setPersonalRecords([]));
  }, [userId]);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const allSessions = useMemo(() => buildAllSessions(exercises), [exercises]);

  const now = new Date();
  const monthStart = startOfMonth(monthOffset === 0 ? now : addMonths(now, monthOffset));
  const monthEnd = endOfMonth(monthStart);

  const data = useMemo(
    () => buildMonthData(allSessions, monthStart, monthEnd, personalRecords),
    [allSessions, personalRecords, monthStart.getTime(), monthEnd.getTime()],
  );
  const muscleKeys = Object.keys(data);

  const computeMuscleAngles = useCallback((d: MuscleData) => {
    const gapDeg = 4;
    const keys = Object.keys(d);
    const total = keys.reduce((s, k) => s + muscleVolume(d[k]), 0) || 1;
    const availableDeg = 360 - gapDeg * keys.length;
    let cursor = 0;
    return keys.map((key) => {
      const vol = muscleVolume(d[key]);
      const span = (vol / total) * availableDeg;
      const a0 = cursor + gapDeg / 2, a1 = a0 + span;
      cursor += span + gapDeg;
      return { key, color: muscleColor(key), a0, a1 };
    });
  }, []);

  const computeDaySegs = useCallback((d: MuscleData, muscleKey: string) => {
    const m = d[muscleKey];
    const base = muscleColor(muscleKey);
    const gapWeek = 6, gapDay = 3;
    const totalVol = m.weeks.reduce((s, w) => s + weekVolume(w), 0) || 1;
    const availableDeg = 360 - gapWeek * m.weeks.length;
    let cursor = 0, globalIdx = 0;
    const segs: Array<{ key: string; a0: number; a1: number; color: string }> = [];
    m.weeks.forEach((w) => {
      const wVol = weekVolume(w) || 1;
      const weekSpan = (wVol / totalVol) * availableDeg;
      const weekStart = cursor + gapWeek / 2;
      cursor += weekSpan + gapWeek;
      const dayAvailable = weekSpan - gapDay * w.days.length;
      let dCursor = weekStart;
      w.days.forEach((dd) => {
        const dVol = dayVolume(dd);
        const dSpan = (dVol / wVol) * dayAvailable;
        const dStart = dCursor + gapDay / 2;
        dCursor += dSpan + gapDay;
        segs.push({ key: dd.key, a0: dStart, a1: dStart + dSpan, color: shade(base, SHADE_STEPS[globalIdx % SHADE_STEPS.length]) });
        globalIdx++;
      });
    });
    return segs;
  }, []);

  const runTransitionFrame = useCallback(() => {
    const t = transitionRef.current;
    if (!t) return;
    const raw = Math.min(1, (performance.now() - t.start) / t.duration);
    t.progress = easeInOutCubic(raw);
    setTick((n) => n + 1);
    if (raw < 1) {
      rafRef.current = requestAnimationFrame(runTransitionFrame);
    } else {
      const finishedDir = t.dir, finishedKey = t.key;
      transitionRef.current = null;
      if (finishedDir === 'in') { setPath([finishedKey]); setSelectedDay(null); }
      else { setPath([]); setSelectedDay(null); }
    }
  }, []);

  const startTransition = (dir: 'in' | 'out', key: string) => {
    if (transitionRef.current) return;
    const muscleAngles = computeMuscleAngles(data);
    const frames: TransitionFrame[] = [];
    if (dir === 'in') {
      const clicked = muscleAngles.find((a) => a.key === key)!;
      const wedgeSpan = clicked.a1 - clicked.a0;
      computeDaySegs(data, key).forEach((d) => frames.push({
        color: d.color,
        from: { a0: clicked.a0 + (d.a0 / 360) * wedgeSpan, a1: clicked.a0 + (d.a1 / 360) * wedgeSpan, r0: 82, r1: 140, opacity: 0.55 },
        to: { a0: d.a0, a1: d.a1, r0: 76, r1: 140, opacity: 1 },
      }));
      muscleAngles.forEach((m) => {
        if (m.key === key) return;
        const mid = (m.a0 + m.a1) / 2;
        frames.push({ color: m.color, from: { a0: m.a0, a1: m.a1, r0: 82, r1: 140, opacity: 1 }, to: { a0: mid, a1: mid, r0: 82, r1: 140, opacity: 0 } });
      });
    } else {
      const target = muscleAngles.find((a) => a.key === key)!;
      const wedgeSpan = target.a1 - target.a0;
      computeDaySegs(data, key).forEach((d) => frames.push({
        color: d.color,
        from: { a0: d.a0, a1: d.a1, r0: 76, r1: 140, opacity: 1 },
        to: { a0: target.a0 + (d.a0 / 360) * wedgeSpan, a1: target.a0 + (d.a1 / 360) * wedgeSpan, r0: 82, r1: 140, opacity: 0.55 },
      }));
      muscleAngles.forEach((m) => {
        if (m.key === key) return;
        const mid = (m.a0 + m.a1) / 2;
        frames.push({ color: m.color, from: { a0: mid, a1: mid, r0: 82, r1: 140, opacity: 0 }, to: { a0: m.a0, a1: m.a1, r0: 82, r1: 140, opacity: 1 } });
      });
    }
    transitionRef.current = { frames, start: performance.now(), duration: 620, dir, key, progress: 0 };
    runTransitionFrame();
  };

  const goTo = (pathArr: string[]) => {
    if (transitionRef.current) return;
    if (pathArr.length === 0) { if (path.length > 0) startTransition('out', path[0]); }
    else if (pathArr.length === 1) startTransition('in', pathArr[0]);
  };
  const goBack = () => goTo([]);
  const selectDay = (dayKey: string) => { setSelectedDay(dayKey); setHistoryIndex(null); };
  const selectHistoryPoint = (idx: number) => setHistoryIndex(idx);
  const prevMonth = () => setMonthOffset((o) => o - 1);
  const nextMonth = () => setMonthOffset((o) => Math.min(0, o + 1));

  const computeHubStats = (d: MuscleData, muscleKey?: string) => {
    if (!muscleKey) {
      const number = Object.keys(d).reduce((s, k) => s + d[k].weeks.reduce((s2, w) => s2 + w.days.reduce((s3, dd) => s3 + dd.sets, 0), 0), 0);
      return { title: 'This month', subtitle: 'sets logged', number, canGoBack: false };
    }
    const m = d[muscleKey];
    const number = m ? m.weeks.reduce((s, w) => s + w.days.reduce((s2, dd) => s2 + dd.sets, 0), 0) : 0;
    return { title: muscleKey, subtitle: 'sets logged', number, canGoBack: true };
  };

  const buildVolumeRows = (d: MuscleData) => {
    const keys = Object.keys(d);
    const rows = keys.map((k) => {
      const m = d[k];
      const vol = muscleVolume(m);
      const sets = m.weeks.reduce((s, w) => s + w.days.reduce((s2, dd) => s2 + dd.sets, 0), 0);
      const allHist = m.weeks.flatMap((w) => w.days.map((dd) => dd.history.length));
      const histLen = allHist.length ? Math.max(...allHist) : 0;
      const agg = Array.from({ length: histLen }, () => 0);
      m.weeks.forEach((w) => w.days.forEach((dd) => dd.history.forEach((v, i) => { agg[i] += v.volume; })));
      let sparkPath = '';
      if (agg.length >= 2) {
        const maxV = Math.max(...agg), minV = Math.min(...agg), rangeV = maxV - minV || 1;
        const sw = 60, sh = 24, stepX = (sw - 4) / (agg.length - 1 || 1);
        const pts = agg.map((v, i) => ({ x: 2 + i * stepX, y: sh - 3 - ((v - minV) / rangeV) * (sh - 6) }));
        sparkPath = smoothPath(pts);
      }
      const last = agg[agg.length - 1] ?? 0, prev = agg[agg.length - 2] ?? last;
      const trend = last > prev ? 'up' : last < prev ? 'down' : 'flat';
      return {
        key: k, color: muscleColor(k), label: k, vol,
        volumeLabel: `${Math.round(vol).toLocaleString()} ${weightUnit}`, sets, sparkPath,
        trendColor: trend === 'up' ? '#5dcaa5' : trend === 'down' ? '#ff4d4d' : '#8692a4',
        trendArrow: trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→',
      };
    }).sort((a, b) => b.vol - a.vol);
    const maxVol = Math.max(...rows.map((r) => r.vol), 1);
    const withPct = rows.map((r) => ({ ...r, pct: Math.round((r.vol / maxVol) * 100) }));
    return {
      volumeRows: withPct,
      monthlyTotalSets: withPct.reduce((s, r) => s + r.sets, 0),
      monthlyTotalVolume: Math.round(withPct.reduce((s, r) => s + r.vol, 0)).toLocaleString(),
    };
  };

  const buildRings = () => {
    const cx = 150, cy = 150;
    if (transitionRef.current) {
      const t = transitionRef.current;
      const arcs: ArcVisual[] = t.frames.map((f) => {
        const a0 = lerp(f.from.a0, f.to.a0, t.progress);
        const a1 = lerp(f.from.a1, f.to.a1, t.progress);
        const r0 = lerp(f.from.r0, f.to.r0, t.progress);
        const r1 = lerp(f.from.r1, f.to.r1, t.progress);
        const opacity = lerp(f.from.opacity, f.to.opacity, t.progress);
        return { path: arcPath(150, 150, r0, r1, a0, a1), fill: f.color, opacity, stroke: 'none', strokeWidth: 0, onClick: null, style: {} };
      });
      return { outerArcs: arcs, outerLabels: [] as LabelVisual[], outerLeaders: [] as LeaderVisual[], innerArcs: [] as ArcVisual[], innerLabels: [] as LabelVisual[], innerDividers: [] as DividerVisual[] };
    }
    if (path.length === 0) {
      const segments: Segment[] = muscleKeys.map((key) => ({ key, label: key, color: muscleColor(key), volume: muscleVolume(data[key]), isSelected: false, onClick: () => goTo([key]) }));
      const r = renderArc(segments, cx, cy, 82, 140, 4, revealed, 9);
      return { outerArcs: r.arcs, outerLabels: r.labels, outerLeaders: r.leaders, innerArcs: [] as ArcVisual[], innerLabels: [] as LabelVisual[], innerDividers: [] as DividerVisual[] };
    }
    const m = data[path[0]];
    if (!m) return { outerArcs: [] as ArcVisual[], outerLabels: [] as LabelVisual[], outerLeaders: [] as LeaderVisual[], innerArcs: [] as ArcVisual[], innerLabels: [] as LabelVisual[], innerDividers: [] as DividerVisual[] };
    const base = muscleColor(path[0]);
    const gapWeek = 6, gapDay = 3;
    const totalVol = m.weeks.reduce((s, w) => s + weekVolume(w), 0) || 1;
    const availableDeg = 360 - gapWeek * m.weeks.length;
    let cursor = 0, globalIdx = 0;
    const daySegs: Array<{ key: string; label: string; color: string; volume: number; angleStart: number; angleSpan: number; sets: number; isSelected: boolean; onClick: () => void }> = [];
    m.weeks.forEach((w) => {
      const wVol = weekVolume(w) || 1;
      const weekSpan = (wVol / totalVol) * availableDeg;
      const weekStart = cursor + gapWeek / 2;
      cursor += weekSpan + gapWeek;
      const dayAvailable = weekSpan - gapDay * w.days.length;
      let dCursor = weekStart;
      w.days.forEach((dd) => {
        const dVol = dayVolume(dd);
        const dSpan = (dVol / wVol) * dayAvailable;
        const dStart = dCursor + gapDay / 2;
        dCursor += dSpan + gapDay;
        daySegs.push({
          key: dd.key, label: dd.name, color: shade(base, SHADE_STEPS[globalIdx % SHADE_STEPS.length]),
          volume: dVol, angleStart: dStart, angleSpan: dSpan, sets: dd.sets,
          onClick: () => selectDay(dd.key), isSelected: selectedDay === dd.key,
        });
        globalIdx++;
      });
    });
    const inner = renderDaySegments(daySegs, cx, cy, revealed);
    return { outerArcs: [] as ArcVisual[], outerLabels: [] as LabelVisual[], outerLeaders: [] as LeaderVisual[], innerArcs: inner.arcs, innerLabels: inner.labels, innerDividers: inner.dividers };
  };

  const buildSelected = () => {
    if (path.length < 1 || !selectedDay) return null;
    const m = data[path[0]];
    if (!m) return null;
    let w: WeekBucket | null = null, d: DayEntry | null = null;
    for (const wk of m.weeks) {
      const found = wk.days.find((dd) => dd.key === selectedDay);
      if (found) { w = wk; d = found; break; }
    }
    if (!d || !w) return null;

    const n = d.history.length;
    if (n === 0) return null;
    const activeIdx = historyIndex === null ? n - 1 : historyIndex;
    const active = d.history[activeIdx] ?? d.history[n - 1];
    const isLatest = activeIdx === n - 1;

    const trendColor = d.trend === 'up' ? '#5dcaa5' : d.trend === 'down' ? '#ff4d4d' : '#8692a4';
    const trendArrow = d.trend === 'up' ? '▲' : d.trend === 'down' ? '▼' : '●';
    const trendShort = d.trend === 'up' ? `+${d.trendPct}% harder` : d.trend === 'down' ? `${d.trendPct}% easier` : 'Same as last time';

    const setChips = Array.from({ length: active.sets }, () => ({ reps: active.reps, weight: active.weight }));
    const musclePct = Math.round((dayVolume(d) / muscleVolume(m)) * 100) || 0;
    const freqCount = parseInt(d.freq, 10) || 1;

    const cw = 300, ch = 110, padX = 18, padTop = 24, padBottom = 22;
    const vols = d.history.map((h) => h.volume);
    const max = Math.max(...vols), min = Math.min(...vols), range = max - min || 1;
    const stepX = n > 1 ? (cw - padX * 2) / (n - 1) : 0;
    const dots = d.history.map((h, i) => ({
      x: padX + i * stepX,
      y: ch - padBottom - ((h.volume - min) / range) * (ch - padTop - padBottom),
      value: h.volume, isActive: i === activeIdx, dateLabel: i === n - 1 ? d.dateLabel : relativeDateLabel(h.date),
      onClick: () => selectHistoryPoint(i),
    }));
    const line = smoothPath(dots);
    const area = n > 1 ? `${line} L${dots[n - 1].x},${ch - padBottom} L${dots[0].x},${ch - padBottom} Z` : '';

    return {
      color: muscleColor(path[0]), name: d.name, muscleLabel: path[0], weekLabel: w.label, dateLabel: isLatest ? d.dateLabel : relativeDateLabel(active.date),
      pr: d.pr && isLatest,
      volumeLabel: `${Math.round(active.volume).toLocaleString()} ${weightUnit}`,
      trendColor, trendArrow, trendShort, frequency: d.freq,
      setChips, reps: active.reps, weight: active.weight,
      volumeRingGrad: `conic-gradient(${muscleColor(path[0])} ${musclePct}%, #1a2030 0)`,
      musclePct, freqDots: Array.from({ length: Math.min(freqCount, 6) }, () => true),
      chartLine: line, chartArea: area,
      chartDots: dots.map((dd) => ({ ...dd, r: dd.isActive ? 5 : 2.5, stroke: dd.isActive ? '#ffffff' : 'none' })),
      chartLabels: dots.map((dd) => ({ x: dd.x, y: dd.y, dateLabel: dd.dateLabel, value: Math.round(dd.value).toLocaleString(), bold: dd.isActive ? 800 : 600 })),
    };
  };

  const rings = buildRings();
  const volStuff = buildVolumeRows(data);
  const selected = buildSelected();
  const hasSelectedDay = path.length === 1 && !!selectedDay;
  const restHub = computeHubStats(data, path[0]);
  const t = transitionRef.current;
  const fromHub = t ? computeHubStats(data, t.dir === 'in' ? undefined : t.key) : null;
  const toHub = t ? computeHubStats(data, t.dir === 'in' ? t.key : undefined) : null;
  const chartHint = path.length === 0 ? 'Tap a muscle group to drill in' : 'Each segment is one workout this month — tap for full detail';
  const monthLabel = format(monthStart, 'MMM yyyy');
  const isCurrentMonth = monthOffset === 0;

  return (
    <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Exercise History</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              onClick={() => goTo([])}
              style={{ color: path.length === 0 ? '#e8edf3' : '#8692a4', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              All muscles
            </span>
            {path.length >= 1 && (
              <>
                <span style={{ color: '#3a4658', fontSize: 12 }}>›</span>
                <span style={{ color: '#e8edf3', fontSize: 13, fontWeight: 700 }}>{path[0]}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={prevMonth} className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-white hover:bg-white/8 transition-colors cursor-pointer">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[12px] font-semibold text-[var(--text-secondary)] tabular-nums min-w-[62px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} disabled={isCurrentMonth} className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-white hover:bg-white/8 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {muscleKeys.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-10 text-center">No workouts logged in {monthLabel}.</p>
      ) : (
        <>
          {/* Radial drill-down chart */}
          <div style={{ position: 'relative', width: 300, height: 300, margin: '18px auto 0' }}>
            <svg width="300" height="300" viewBox="0 0 300 300" style={{ overflow: 'visible' }}>
              {rings.outerArcs.map((a, i) => (
                <path key={`oa${i}`} d={a.path} fill={a.fill} opacity={a.opacity} stroke={a.stroke} strokeWidth={a.strokeWidth} onClick={a.onClick ?? undefined} style={a.style} />
              ))}
              {rings.outerLeaders.map((ll, i) => (
                <path key={`ol${i}`} d={ll.line} stroke={ll.dotColor} strokeWidth={1} fill="none" opacity={0.55} style={ll.style} />
              ))}
              {rings.innerArcs.map((a, i) => (
                <path key={`ia${i}`} d={a.path} fill={a.fill} opacity={a.opacity} stroke={a.stroke} strokeWidth={a.strokeWidth} onClick={a.onClick ?? undefined} style={a.style} />
              ))}
              {rings.innerDividers.map((dv, i) => (
                <path key={`dv${i}`} d={dv.path} stroke="#0a0c10" strokeWidth={1.5} opacity={dv.opacity} fill="none" />
              ))}
            </svg>
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, transition: 'opacity 0.18s ease', opacity: transitionRef.current ? 0 : 1 }}>
              {rings.outerLabels.map((lb, i) => (
                <div key={`ol2-${i}`} style={{ position: 'absolute', left: lb.x, top: lb.y, transform: `translate(-50%,-50%) rotate(${lb.rot}deg)`, color: '#0a0c10', whiteSpace: 'nowrap', ...lb.style }}>{lb.char}</div>
              ))}
              {rings.outerLeaders.map((ldl, i) => (
                <div key={`old-${i}`} style={{ position: 'absolute', left: ldl.labelX, top: ldl.labelY, transform: `translate(${ldl.translateX}, -50%)`, textAlign: ldl.textAlign, ...ldl.style }}>
                  <div style={{ color: ldl.dotColor, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', lineHeight: 1.15 }}>{ldl.text} · {ldl.pct}%</div>
                </div>
              ))}
              {rings.innerLabels.map((lb2, i) => (
                <div key={`il2-${i}`} style={{ position: 'absolute', left: lb2.x, top: lb2.y, transform: `translate(-50%,-50%) rotate(${lb2.rot}deg)`, color: 'rgba(10,12,16,0.88)', whiteSpace: 'nowrap', ...lb2.style }}>{lb2.char}</div>
              ))}
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div
                onClick={path.length > 0 ? goBack : undefined}
                style={{ width: 150, height: 150, borderRadius: 999, background: '#121720', border: '1px solid #1e2638', position: 'relative', cursor: path.length > 0 ? 'pointer' : 'default', pointerEvents: path.length > 0 ? 'auto' : 'none' }}
              >
                {t && fromHub && toHub ? (
                  <>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 1 - t.progress, transform: `translateY(${-t.progress * 10}px)` }}>
                      <div style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {fromHub.canGoBack && <div style={{ color: '#C8FF00', fontSize: 12, fontWeight: 700 }}>‹ Back</div>}
                      </div>
                      <div style={{ color: '#8692a4', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{fromHub.title}</div>
                      <div style={{ color: '#e8edf3', fontSize: 28, fontWeight: 700, lineHeight: 1.15, marginTop: 2 }}>{fromHub.number}</div>
                      <div style={{ color: '#8692a4', fontSize: 11 }}>{fromHub.subtitle}</div>
                    </div>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: t.progress, transform: `translateY(${(1 - t.progress) * 10}px)` }}>
                      <div style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {toHub.canGoBack && <div style={{ color: '#C8FF00', fontSize: 12, fontWeight: 700 }}>‹ Back</div>}
                      </div>
                      <div style={{ color: '#8692a4', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{toHub.title}</div>
                      <div style={{ color: '#e8edf3', fontSize: 28, fontWeight: 700, lineHeight: 1.15, marginTop: 2 }}>{toHub.number}</div>
                      <div style={{ color: '#8692a4', fontSize: 11 }}>{toHub.subtitle}</div>
                    </div>
                  </>
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {path.length > 0 && <div style={{ color: '#C8FF00', fontSize: 12, fontWeight: 700 }}>‹ Back</div>}
                    </div>
                    <div style={{ color: '#8692a4', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{restHub.title}</div>
                    <div style={{ color: '#e8edf3', fontSize: 28, fontWeight: 700, lineHeight: 1.15, marginTop: 2 }}>{restHub.number}</div>
                    <div style={{ color: '#8692a4', fontSize: 11 }}>{restHub.subtitle}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <p className="text-center text-[var(--text-muted)] text-[11px] mt-3.5">{chartHint}</p>

          {/* Detail card for a selected workout session */}
          {hasSelectedDay && selected ? (
            <div className="rounded-2xl border border-white/[0.08] bg-[#121720] p-4 mt-4">
              <div className="flex items-center gap-2.5 pb-3.5 border-b border-white/[0.08]">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: selected.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-white text-[17px] font-bold">{selected.name}</div>
                  <div className="text-[var(--text-muted)] text-[12px] mt-0.5">{selected.muscleLabel} · {selected.weekLabel} · {selected.dateLabel}</div>
                </div>
                {selected.pr && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(200,255,0,0.1)', color: '#C8FF00' }}>PR</span>}
              </div>

              <div className="flex gap-2.5 mt-3.5 pb-3.5 border-b border-white/[0.08]">
                <div className="flex-1 rounded-[10px] p-3 flex items-center" style={{ background: '#0f141c' }}>
                  <div className="flex gap-2 flex-wrap">
                    {selected.setChips.map((chip, i) => (
                      <div key={i} className="relative w-[52px] h-14 rounded-[10px] flex flex-col items-center justify-center gap-0.5" style={{ background: `${selected.color}cc` }}>
                        <div className="text-white text-[16px] font-extrabold leading-none">{chip.weight}<span className="text-[9px] font-extrabold">{weightUnit}</span></div>
                        <div className="w-[26px] h-px my-1" style={{ background: 'rgba(255,255,255,0.3)' }} />
                        <div className="text-[11px] font-extrabold leading-none rounded-full px-1.5 py-0.5" style={{ color: '#0a0c10', background: 'rgba(255,255,255,0.85)' }}>{chip.reps}×</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="w-16 flex-shrink-0 flex flex-col items-center gap-1">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: selected.volumeRingGrad }}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-[13px] font-bold text-white" style={{ background: '#0f141c' }}>{selected.musclePct}%</div>
                  </div>
                  <div className="text-[8.5px] font-semibold text-center leading-tight text-[var(--text-muted)]">of {selected.muscleLabel} volume</div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2.5 rounded-[10px] px-3 py-2.5" style={{ background: '#0f141c' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[20px] font-bold leading-none" style={{ color: selected.trendColor }}>{selected.trendArrow}</span>
                  <span className="text-white text-[12px] font-bold">{selected.trendShort}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-1">
                    {selected.freqDots.map((_, i) => <span key={i} className="w-[7px] h-[7px] rounded-full" style={{ background: selected.color }} />)}
                  </div>
                  <span className="text-[10.5px] font-semibold text-[var(--text-muted)]">{selected.frequency}</span>
                </div>
              </div>

              <div className="mt-3.5">
                <div className="flex items-center justify-between gap-2.5 mb-2.5">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)] whitespace-nowrap">Volume trend</div>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] whitespace-nowrap">{selected.frequency}</span>
                </div>
                <div className="relative mx-auto" style={{ width: 300, height: 110 }}>
                  <svg width="300" height="110" viewBox="0 0 300 110" style={{ position: 'absolute', inset: 0 }}>
                    <defs>
                      <linearGradient id="exRadialAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={selected.color} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={selected.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <path d={selected.chartArea} fill="url(#exRadialAreaGrad)" />
                    <path d={selected.chartLine} fill="none" stroke={selected.color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
                    {selected.chartDots.map((cd, i) => (
                      <React.Fragment key={i}>
                        <circle cx={cd.x} cy={cd.y} r={10} fill="transparent" onClick={cd.onClick} style={{ cursor: 'pointer' }} />
                        <circle cx={cd.x} cy={cd.y} r={cd.r} fill={selected.color} stroke={cd.stroke} strokeWidth={2} onClick={cd.onClick} style={{ cursor: 'pointer' }} />
                      </React.Fragment>
                    ))}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {selected.chartLabels.map((cl, i) => (
                      <div key={`clv${i}`} style={{ position: 'absolute', left: cl.x, top: cl.y, transform: 'translate(-50%,-100%) translateY(-6px)', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 700, color: '#e8edf3', textAlign: 'center' }}>{cl.value}</div>
                    ))}
                    {selected.chartLabels.map((cl, i) => (
                      <div key={`cld${i}`} style={{ position: 'absolute', left: cl.x, top: 96, transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 9, fontWeight: cl.bold, color: '#8692a4', textAlign: 'center' }}>{cl.dateLabel}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : path.length === 1 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.08] p-5 text-center text-[13px] text-[var(--text-muted)] mt-4">
              Tap a workout segment to see set-by-set detail.
            </div>
          ) : null}

          {/* Monthly volume list */}
          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Monthly volume</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-white text-[30px] font-extrabold leading-none">{volStuff.monthlyTotalSets}</span>
              <span className="text-[13px] text-[var(--text-muted)]">sets · {volStuff.monthlyTotalVolume} {weightUnit}</span>
            </div>
            {volStuff.volumeRows.map((row) => (
              <div key={row.key} className="py-4 border-t border-white/[0.08]">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                      <span className="text-white text-[14px] font-bold">{row.label}</span>
                      <span className="text-[var(--text-muted)] text-[12px]">{row.volumeLabel}</span>
                    </div>
                    <div className="h-1 rounded-full mt-3 overflow-hidden" style={{ background: '#1a2030' }}>
                      <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.color }} />
                    </div>
                  </div>
                  <div className="w-[88px] flex-shrink-0 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      {row.sparkPath && (
                        <svg width="60" height="24" viewBox="0 0 60 24" style={{ overflow: 'visible' }}>
                          <path d={row.sparkPath} fill="none" stroke={row.color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      <span className="text-[14px] font-bold" style={{ color: row.trendColor }}>{row.trendArrow}</span>
                    </div>
                    <div className="text-[11px] font-semibold whitespace-nowrap text-[var(--text-muted)]">{row.sets} sets</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

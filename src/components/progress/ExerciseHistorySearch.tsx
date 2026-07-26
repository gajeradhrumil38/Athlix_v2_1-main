import React, { useEffect, useMemo, useState } from 'react';
import { Search, History, ChevronRight, Trophy } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { format } from 'date-fns';
import { fuzzyFilter } from '../../lib/fuzzySearch';
import { isWeightUnit } from '../../lib/units';
import { parseDateAtStartOfDay } from '../../lib/dates';
import { getPersonalRecords, type LocalPersonalRecord } from '../../lib/supabaseData';
import { haptics } from '../../lib/haptics';
import { palette } from '../../theme/colors';
import { ExerciseHistorySheet } from './ExerciseHistorySheet';

interface ExerciseHistorySearchProps {
  userId: string;
  exercises: any[]; // full history rows, already unit-converted by the parent (Progress.tsx)
  weightUnit: 'kg' | 'lbs';
}

interface ExerciseSummary {
  name: string;
  muscleGroup: string | null;
  lastDate: string;
  lastWeight: number;
  lastReps: number;
}

// Same muscle-group palette the Monthly Volume section already uses, so a
// row's accent dot reads as the same color language across the page.
const MUSCLE_HEX_MAP: Record<string, string> = {
  Chest: palette.chest, Back: palette.back, Legs: palette.legs,
  Shoulders: palette.shoulders, Core: palette.core, Biceps: palette.biceps,
  Triceps: palette.triceps, Arms: palette.biceps, Cardio: palette.cardio,
  Glutes: '#F4B96A', Forearms: '#98D4E8', Mobility: '#85C9B0', Yoga: '#7CB9C8',
};

export const ExerciseHistorySearch: React.FC<ExerciseHistorySearchProps> = ({ userId, exercises, weightUnit }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ExerciseSummary | null>(null);
  const [personalRecords, setPersonalRecords] = useState<LocalPersonalRecord[]>([]);

  useEffect(() => {
    getPersonalRecords(userId).then(setPersonalRecords).catch(() => setPersonalRecords([]));
  }, [userId]);

  // Only exercises the user has actually logged, weight-based only (skips
  // distance-unit cardio entries a growth-by-weight chart wouldn't suit),
  // most-recently-trained first as the default (untyped) order. Tracks the
  // most recent set's weight/reps too, so each row can preview a real
  // number without requiring a tap into the detail sheet.
  const summaries = useMemo<ExerciseSummary[]>(() => {
    const map = new Map<string, ExerciseSummary>();
    exercises.forEach((ex) => {
      const date = ex.workouts?.date;
      if (!date || !ex.name || !isWeightUnit(ex.unit)) return;
      const existing = map.get(ex.name);
      if (!existing || date > existing.lastDate) {
        map.set(ex.name, {
          name: ex.name,
          muscleGroup: ex.muscle_group ?? null,
          lastDate: date,
          lastWeight: Number(ex.weight) || 0,
          lastReps: Number(ex.reps) || 0,
        });
      } else if (date === existing.lastDate && Number(ex.weight) > existing.lastWeight) {
        // Same session, multiple sets — keep the heaviest set as the preview.
        existing.lastWeight = Number(ex.weight) || 0;
        existing.lastReps = Number(ex.reps) || 0;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [exercises]);

  const results = useMemo(() => fuzzyFilter(summaries, query, (s) => s.name, 20), [summaries, query]);

  const selectedPr = selected ? personalRecords.find((pr) => pr.exercise_name === selected.name) ?? null : null;

  return (
    <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Exercise History</p>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an exercise you've logged…"
          className="w-full h-10 bg-white/[0.03] border border-white/8 rounded-xl pl-9 pr-3 text-[13px] text-white outline-none focus:border-[var(--accent)]/40 placeholder:text-[var(--text-muted)]"
        />
      </div>

      {summaries.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-4 text-center">Log a workout to see exercise history here.</p>
      ) : results.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-4 text-center">No logged exercise matches &quot;{query}&quot;.</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {results.map((s, i) => {
            const dotColor = s.muscleGroup ? MUSCLE_HEX_MAP[s.muscleGroup] ?? palette.accent : palette.accent;
            const hasPr = personalRecords.some((pr) => pr.exercise_name === s.name);
            return (
              <motion.button
                key={s.name}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(i, 8) * 0.02 }}
                onClick={() => { haptics.tick(); setSelected(s); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 active:scale-[0.98] transition-all duration-150 text-left cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[13px] font-semibold text-white truncate">{s.name}</p>
                    {hasPr && <Trophy className="w-3 h-3 text-[var(--accent)] flex-shrink-0" />}
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] mt-0.5">
                    {s.muscleGroup ? `${s.muscleGroup} · ` : ''}
                    {s.lastWeight > 0 ? `${s.lastWeight}${weightUnit}×${s.lastReps}` : `${s.lastReps} reps`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {(() => { const d = parseDateAtStartOfDay(s.lastDate); return d ? format(d, 'MMM d') : ''; })()}
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
              </motion.button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <ExerciseHistorySheet
            exerciseName={selected.name}
            muscleGroup={selected.muscleGroup}
            exercises={exercises}
            personalRecord={selectedPr}
            weightUnit={weightUnit}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

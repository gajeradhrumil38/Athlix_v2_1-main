import React, { useEffect, useMemo, useState } from 'react';
import { Search, History } from 'lucide-react';
import { format } from 'date-fns';
import { fuzzyFilter } from '../../lib/fuzzySearch';
import { isWeightUnit } from '../../lib/units';
import { parseDateAtStartOfDay } from '../../lib/dates';
import { getPersonalRecords, type LocalPersonalRecord } from '../../lib/supabaseData';
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
}

export const ExerciseHistorySearch: React.FC<ExerciseHistorySearchProps> = ({ userId, exercises, weightUnit }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ExerciseSummary | null>(null);
  const [personalRecords, setPersonalRecords] = useState<LocalPersonalRecord[]>([]);

  useEffect(() => {
    getPersonalRecords(userId).then(setPersonalRecords).catch(() => setPersonalRecords([]));
  }, [userId]);

  // Only exercises the user has actually logged, weight-based only (skips
  // distance-unit cardio entries a growth-by-weight chart wouldn't suit),
  // most-recently-trained first as the default (untyped) order.
  const summaries = useMemo<ExerciseSummary[]>(() => {
    const map = new Map<string, ExerciseSummary>();
    exercises.forEach((ex) => {
      const date = ex.workouts?.date;
      if (!date || !ex.name || !isWeightUnit(ex.unit)) return;
      const existing = map.get(ex.name);
      if (!existing || date > existing.lastDate) {
        map.set(ex.name, { name: ex.name, muscleGroup: ex.muscle_group ?? null, lastDate: date });
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
          {results.map((s) => (
            <button
              key={s.name}
              onClick={() => setSelected(s)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              <div>
                <p className="text-[13px] font-semibold text-white">{s.name}</p>
                {s.muscleGroup && <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] mt-0.5">{s.muscleGroup}</p>}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {(() => { const d = parseDateAtStartOfDay(s.lastDate); return d ? format(d, 'MMM d') : ''; })()}
              </p>
            </button>
          ))}
        </div>
      )}

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
    </div>
  );
};

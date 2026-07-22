import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Plus, Trophy, Sparkles, Pencil, Tag, Trash2, Check, ChevronDown, X } from 'lucide-react';
import type { ExerciseEntry, Set } from '../../pages/Log';
import { SetRow } from './SetRow';
import { useAuth } from '../../contexts/AuthContext';
import { getLastExerciseSession } from '../../lib/supabaseData';
import { parseDateAtStartOfDay } from '../../lib/dates';

const MUSCLE_GROUPS = [
  { name: 'Chest',     cssVar: '--chest'     },
  { name: 'Back',      cssVar: '--back'      },
  { name: 'Shoulders', cssVar: '--shoulders' },
  { name: 'Biceps',    cssVar: '--biceps'    },
  { name: 'Triceps',   cssVar: '--triceps'   },
  { name: 'Legs',      cssVar: '--legs'      },
  { name: 'Core',      cssVar: '--core'      },
  { name: 'Cardio',    cssVar: '--cardio'    },
  { name: 'Yoga',      cssVar: '--purple'    },
];

interface ExerciseBlockProps {
  exercise: ExerciseEntry;
  onUpdate: (updated: ExerciseEntry) => void;
  onRemove: () => void;
  onStartRest: (duration: number, exerciseName: string) => void;
  onRename?: (newName: string) => void;
  onChangeMuscleGroup?: (newGroup: string) => void;
}

export const ExerciseBlock: React.FC<ExerciseBlockProps> = ({
  exercise, onUpdate, onRemove, onStartRest, onRename, onChangeMuscleGroup,
}) => {
  const { user } = useAuth();
  const [lastSession, setLastSession] = useState<any>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [isPR, setIsPR] = useState(false);

  // Rename state
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Muscle group state
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  useEffect(() => {
    const fetchLastSession = async () => {
      if (!user) return;
      const data = await getLastExerciseSession(user.id, exercise.name);
      if (data) setLastSession(data);
    };
    fetchLastSession();
  }, [user, exercise.name]);

  useEffect(() => {
    if (showRename) {
      setRenameValue(exercise.name);
      setTimeout(() => renameInputRef.current?.focus(), 60);
    }
  }, [showRename, exercise.name]);

  const handleAddSet = () => {
    const sets = exercise.sets || [];
    const lastSet = sets[sets.length - 1];
    const newSet: Set = {
      id: Math.random().toString(36).substr(2, 9),
      weight: lastSet ? lastSet.weight : (lastSession?.weight || null),
      reps: lastSet ? lastSet.reps : (lastSession?.reps || null),
      done: false,
    };
    onUpdate({ ...exercise, sets: [...sets, newSet] });
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleUpdateSet = (setId: string, updatedSet: Set) => {
    onUpdate({ ...exercise, sets: (exercise.sets || []).map(s => s.id === setId ? updatedSet : s) });
    if (updatedSet.done) {
      if (updatedSet.weight && (!lastSession || updatedSet.weight > lastSession.weight)) {
        setIsPR(true);
        setTimeout(() => setIsPR(false), 3000);
      }
      let restPrefs: Record<string, number> = {};
      try { restPrefs = JSON.parse(localStorage.getItem('athlix_rest_prefs') || '{}'); } catch { restPrefs = {}; }
      const duration = restPrefs[exercise.name] || 90;
      onStartRest(duration, exercise.name);
    }
  };

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== exercise.name) {
      onRename?.(trimmed);
    }
    setShowRename(false);
  };

  const totalVolume = (exercise.sets || [])
    .filter(s => s.done)
    .reduce((acc, s) => acc + (Number(s.weight || 0) * Number(s.reps || 0)), 0);

  const groupCssVar = MUSCLE_GROUPS.find(g => g.name === exercise.muscleGroup)?.cssVar ?? '--accent';

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[13px] font-bold text-[var(--text-primary)] truncate">{exercise.name}</h3>
          <div className="flex items-center gap-1 shrink-0">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: `var(${groupCssVar})` }} />
            <span className="text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">{exercise.muscleGroup}</span>
          </div>
          <AnimatePresence>
            {isPR && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                className="flex items-center gap-1 px-2 py-0.5 bg-[var(--pr-gold)]/20 rounded-full shrink-0"
              >
                <Trophy className="w-3 h-3 text-[var(--pr-gold)]" />
                <span className="text-[9px] font-bold text-[var(--pr-gold)]">NEW PR!</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={() => { setShowMenu(v => !v); setShowGroupPicker(false); setShowRename(false); }}
          className="p-1 text-[var(--text-muted)] shrink-0"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Action menu */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-b border-[var(--border)]"
            style={{ background: 'var(--bg-elevated)' }}
          >
            <div className="flex items-center gap-1 px-3 py-2">
              <button
                onClick={() => { setShowRename(true); setShowGroupPicker(false); setShowMenu(false); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors active:opacity-70 cursor-pointer"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                Rename
              </button>
              <button
                onClick={() => { setShowGroupPicker(v => !v); setShowRename(false); setShowMenu(false); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors active:opacity-70 cursor-pointer"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                <Tag className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                Muscle Group
              </button>
              <button
                onClick={() => { onRemove(); setShowMenu(false); }}
                className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors active:opacity-70 cursor-pointer"
                style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rename input */}
      <AnimatePresence>
        {showRename && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-b border-[var(--border)]"
          >
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: 'var(--bg-elevated)' }}>
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setShowRename(false); }}
                className="flex-1 h-9 rounded-lg px-3 text-[13px] focus:outline-none"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                placeholder="Exercise name…"
              />
              <button
                onClick={handleRenameSubmit}
                className="h-9 w-9 flex items-center justify-center rounded-lg cursor-pointer"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowRename(false)}
                className="h-9 w-9 flex items-center justify-center rounded-lg cursor-pointer"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Muscle group picker */}
      <AnimatePresence>
        {showGroupPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-b border-[var(--border)]"
          >
            <div className="px-3 py-2.5 flex flex-wrap gap-2" style={{ background: 'var(--bg-elevated)' }}>
              {MUSCLE_GROUPS.map(g => {
                const active = exercise.muscleGroup === g.name;
                return (
                  <button
                    key={g.name}
                    onClick={() => {
                      if (!active) { onChangeMuscleGroup?.(g.name); }
                      setShowGroupPicker(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95 cursor-pointer"
                    style={{
                      background: active ? `color-mix(in srgb, var(${g.cssVar}) 20%, transparent)` : 'var(--bg-surface)',
                      border: active ? `1.5px solid var(${g.cssVar})` : '1px solid var(--border)',
                      color: active ? `var(${g.cssVar})` : 'var(--text-secondary)',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: `var(${g.cssVar})` }} />
                    {g.name}
                    {active && <Check className="w-3 h-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last Session Row */}
      <div className="px-4 py-2 bg-[var(--bg-elevated)]/50 flex items-center justify-between">
        {lastSession ? (
          <span className="text-[10px] text-[var(--text-secondary)]">
            Last: {(() => {
              const parsedDate = parseDateAtStartOfDay(lastSession.workouts?.date);
              return parsedDate ? parsedDate.toLocaleDateString() : '--';
            })()} · {lastSession.reps} reps @ {lastSession.weight}kg
          </span>
        ) : (
          <span className="text-[10px] text-[var(--accent)] inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> First time - set your benchmark
          </span>
        )}
      </div>

      {/* Sets */}
      <div className="p-4 space-y-2">
        <div className="flex items-center text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[1.5px] px-2 mb-1">
          <span className="w-8">Set</span>
          <span className="flex-1 text-center">Weight (kg)</span>
          <span className="flex-1 text-center">Reps</span>
          <span className="w-10"></span>
        </div>
        {(exercise.sets || []).map((set, i) => (
          <SetRow
            key={set.id}
            index={i + 1}
            set={set}
            onUpdate={(updated) => handleUpdateSet(set.id, updated)}
          />
        ))}
      </div>

      {/* Add Set Button */}
      <button
        onClick={handleAddSet}
        className="w-full py-3 border-t border-[var(--border)] text-[10px] font-bold text-[var(--accent)]/60 hover:text-[var(--accent)] transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-3 h-3" /> Add Set
      </button>

      {/* Footer */}
      <div className="px-4 py-2 bg-[var(--bg-base)]/30 flex items-center justify-between border-t border-[var(--border)]">
        <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider font-bold">
          Total: {(exercise.sets || []).filter(s => s.done).length} sets · {totalVolume.toLocaleString()}kg
        </span>
        <button
          onClick={() => setShowGroupPicker(v => !v)}
          className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider transition-opacity active:opacity-50 cursor-pointer"
          style={{ color: `var(${groupCssVar})` }}
        >
          <ChevronDown className="w-3 h-3" />
          {exercise.muscleGroup}
        </button>
      </div>
    </div>
  );
};

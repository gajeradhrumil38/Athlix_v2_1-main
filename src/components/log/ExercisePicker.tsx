import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Plus, History, LayoutGrid, ChevronLeft, ClipboardList, Play, Check, Pencil, Trash2, Dumbbell, SlidersHorizontal } from 'lucide-react';
import { CreateExerciseSheet } from './CreateExerciseSheet';
import { getMachineLabel } from '../../lib/machineLabels';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useExerciseOverrides } from '../../contexts/ExerciseOverridesContext';
import type { ExerciseInputType } from '../../lib/exerciseTypes';
import {
  getExerciseLibraryByGroup,
  getRecentExerciseOptions,
  getTemplates,
  deleteTemplate,
  searchExerciseLibrary,
  extractInputTypeFromSlugs,
} from '../../lib/supabaseData';

// ── Types ────────────────────────────────────────────────────────────────────

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  inputTypeOverride?: string;
  lastSession?: {
    weight: number;
    reps: number;
    date: string;
    sets?: number;
    perSetData?: Array<{ weight: number; reps: number }>;
  };
  defaultSets?: number;
  defaultReps?: number;
  defaultWeight?: number;
}

interface Template {
  id: string;
  title: string;
  template_exercises: Array<{
    id?: string;
    name: string;
    muscle_group?: string | null;
    exercise_db_id?: string | null;
    default_sets?: number;
    default_reps?: number;
    default_weight?: number;
  }>;
}

interface ExercisePickerProps {
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
  recentExercises: Exercise[];
  onLoadTemplate?: (exercises: Exercise[], title?: string) => void;
  onStartTemplate?: (exercises: Exercise[], title: string) => void;
  onEditTemplate?: (template: any) => void;
  onLoadPlan?: (template: Template) => void;
  multiSelect?: boolean;
  defaultTab?: 'recent' | 'muscle' | 'plans';
  weightUnit?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

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

const MUSCLE_CSS_VAR: Record<string, string> = Object.fromEntries(
  MUSCLE_GROUPS.map((g) => [g.name, g.cssVar]),
);

// ── Sub-components ───────────────────────────────────────────────────────────

const InitialBadge: React.FC<{ label: string; colorVar?: string; size?: 'sm' | 'md' }> = ({
  label,
  colorVar = '--text-secondary',
  size = 'sm',
}) => {
  const isSmall = size === 'sm';
  return (
    <div
      className={`${isSmall ? 'h-10 w-10 rounded-xl text-[15px]' : 'h-11 w-11 rounded-xl text-[16px]'} flex items-center justify-center border font-bold uppercase shrink-0`}
      style={{
        background: `color-mix(in srgb, var(${colorVar}) 12%, var(--bg-elevated))`,
        borderColor: `color-mix(in srgb, var(${colorVar}) 26%, transparent)`,
        color: `var(${colorVar})`,
      }}
    >
      {label.charAt(0)}
    </div>
  );
};

// Split "Bench Press (one arm, biased)" → ["Bench Press", "one arm, biased"]
const splitVariant = (name: string): [string, string | null] => {
  const idx = name.indexOf('(');
  if (idx === -1) return [name, null];
  return [name.slice(0, idx).trim(), name.slice(idx + 1).replace(/\)$/, '').trim()];
};

const TYPE_MENU_OPTIONS: { value: ExerciseInputType; label: string }[] = [
  { value: 'weight_reps', label: 'Weight' },
  { value: 'reps_only', label: 'Reps' },
  { value: 'time_only', label: 'Time' },
  { value: 'distance_only', label: 'Distance' },
];

const ExerciseRow: React.FC<{
  exercise: Exercise;
  isSelected: boolean;
  onToggle: (exercise: Exercise) => void;
  weightUnit?: string;
}> = ({ exercise, isSelected, onToggle, weightUnit = 'lbs' }) => {
  const { setOverride } = useExerciseOverrides();
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const cssVar = MUSCLE_CSS_VAR[exercise.muscleGroup];
  const [baseName, variant] = splitVariant(exercise.name);
  const machineLabel = getMachineLabel(exercise.name);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onToggle(exercise)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(exercise); }}
      className="relative w-full rounded-xl flex items-center gap-3 px-3 py-2.5 text-left active:scale-[0.99] transition-all duration-150 cursor-pointer"
      style={{
        background: 'var(--bg-surface)',
        border: isSelected ? '1.5px solid rgba(200,255,0,0.6)' : '1px solid var(--border)',
        minHeight: 60,
      }}
    >
      <InitialBadge
        label={baseName}
        colorVar={MUSCLE_CSS_VAR[exercise.muscleGroup] || '--text-secondary'}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            {baseName}
          </span>
          {variant && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              {variant}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] font-medium" style={{ color: cssVar ? `var(${cssVar})` : 'var(--text-secondary)' }}>
            {exercise.muscleGroup}
          </span>
          {machineLabel && (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.55 }}>
              · {machineLabel}
            </span>
          )}
        </div>
      </div>
      {exercise.lastSession && !isSelected && (
        <div className="flex flex-col items-end shrink-0 pr-1 gap-0.5">
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
            {exercise.lastSession.sets ?? 1}×{exercise.lastSession.weight}{weightUnit}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {exercise.lastSession.reps} reps
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShowTypeMenu((v) => !v); }}
        title="Change tracking type"
        aria-label="Change tracking type"
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
      </button>
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150"
        style={
          isSelected
            ? { background: 'var(--accent)', color: '#000' }
            : { background: 'var(--accent-dim)', color: 'var(--accent)' }
        }
      >
        {isSelected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </div>

      {showTypeMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-full mt-1 z-20 flex gap-1 rounded-xl p-1 shadow-lg"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          {TYPE_MENU_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setOverride(exercise.name, opt.value);
                setShowTypeMenu(false);
                toast.success(`${baseName} set to ${opt.label}`);
              }}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer"
              style={{ background: 'transparent', color: 'var(--text-secondary)' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────────

export const ExercisePicker: React.FC<ExercisePickerProps> = ({
  onSelect,
  onClose,
  recentExercises,
  onLoadTemplate,
  onStartTemplate,
  onEditTemplate,
  onLoadPlan,
  multiSelect = false,
  defaultTab = 'recent',
  weightUnit = 'lbs',
}) => {
  const { user } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'recent' | 'muscle' | 'plans' | 'search'>(defaultTab);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [filterMuscle, setFilterMuscle] = useState<string | null>(null);
  const [libraryExercises, setLibraryExercises] = useState<Exercise[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentLibraryExercises, setRecentLibraryExercises] = useState<Exercise[]>(() => {
    try {
      const cached = localStorage.getItem('athlix_recent_exercises');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [selectedMap, setSelectedMap] = useState<Map<string, Exercise>>(new Map());

  // ── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    setRecentLoading(recentLibraryExercises.length === 0);
    getRecentExerciseOptions(user.id).then((recent) => {
      const mapped: Exercise[] = recent.map((ex, i) => ({
        id: `${ex.name}-${i}`,
        name: ex.name,
        muscleGroup: ex.muscleGroup,
        exercise_db_id: ex.exercise_db_id || undefined,
        lastSession: ex.lastSession
          ? {
              weight: ex.lastSession.weight,
              reps: ex.lastSession.reps,
              date: ex.lastSession.date,
              sets: ex.lastSession.sets,
              perSetData: ex.lastSession.perSetData,
            }
          : undefined,
      }));
      setRecentLibraryExercises(mapped);
      setRecentLoading(false);
      try { localStorage.setItem('athlix_recent_exercises', JSON.stringify(mapped)); } catch { /* quota */ }
    }).catch(() => setRecentLoading(false));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    if (search.trim()) {
      searchExerciseLibrary(user.id, search).then((results) => {
        setLibraryExercises(results.map((ex) => ({
          id: ex.id,
          name: ex.name,
          muscleGroup: ex.muscle_group,
          exercise_db_id: ex.exercise_db_id || undefined,
          inputTypeOverride: extractInputTypeFromSlugs(ex.muscle_slugs) || undefined,
        })));
      });
      return;
    }
    if (selectedMuscle) {
      getExerciseLibraryByGroup(user.id, selectedMuscle).then((results) => {
        setLibraryExercises(results.map((ex) => ({
          id: ex.id,
          name: ex.name,
          muscleGroup: ex.muscle_group,
          exercise_db_id: ex.exercise_db_id || undefined,
          inputTypeOverride: extractInputTypeFromSlugs(ex.muscle_slugs) || undefined,
        })));
      });
      return;
    }
    setLibraryExercises([]);
  }, [user, search, selectedMuscle]);

  // Always re-fetch when the plans tab becomes active — ensures newly created/edited plans appear
  useEffect(() => {
    if (activeTab !== 'plans' || !user) return;
    setTemplatesLoading(true);
    getTemplates(user.id)
      .then((data) => setTemplates((data as Template[]) || []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [activeTab, user]); // intentionally omits templates.length so it re-fetches every time tab is opened

  // ── Handlers ──────────────────────────────────────────────────────────────

  const filteredExercises = useMemo(() => {
    if (!filterMuscle) return libraryExercises;
    return libraryExercises.filter(ex => ex.muscleGroup === filterMuscle);
  }, [libraryExercises, filterMuscle]);
  const isNestedView = Boolean(search.trim()) || Boolean(selectedMuscle);

  const handleToggle = (exercise: Exercise) => {
    if (!multiSelect) {
      onSelect(exercise);
      onClose();
      return;
    }
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(exercise.name)) next.delete(exercise.name);
      else next.set(exercise.name, exercise);
      return next;
    });
  };

  const handleAddSelected = () => {
    selectedMap.forEach((ex) => onSelect(ex));
    onClose();
  };

  const handleBack = () => {
    if (search.trim()) {
      setSearch('');
      setActiveTab(selectedMuscle ? 'muscle' : 'recent');
      return;
    }
    if (selectedMuscle) { setSelectedMuscle(null); return; }
    onClose();
  };

  const templateToExercises = (tmpl: Template): Exercise[] =>
    tmpl.template_exercises.map((te, i) => ({
      id: `${te.name}-${i}`,
      name: te.name,
      muscleGroup: te.muscle_group || 'Other',
      exercise_db_id: te.exercise_db_id || undefined,
      defaultSets: te.default_sets ?? 3,
      defaultReps: te.default_reps ?? 10,
      defaultWeight: te.default_weight ?? 0,
    }));

  const handleDeletePlan = async (tmplId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setDeletingId(tmplId);
    try {
      await deleteTemplate(user.id, tmplId);
      setTemplates((prev) => prev.filter((t) => t.id !== tmplId));
      toast.success('Plan deleted');
    } catch {
      toast.error('Failed to delete plan');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="absolute inset-0 mx-auto w-full max-w-[860px] flex flex-col border-x lg-sheet"
        style={{ borderColor: 'var(--border)', borderTop: '1px solid rgba(255,255,255,0.13)' }}
      >
        <div className="lg-handle" />
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={handleBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-medium transition-colors"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {isNestedView ? 'Back' : 'Close'}
          </button>

          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Add Exercise
          </h2>

          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Search + Tabs ── */}
        <div className="px-4 pt-3 pb-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search exercises"
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (e.target.value) setActiveTab('search' as any); else setFilterMuscle(null); }}
              className="w-full h-11 rounded-xl pl-10 pr-4 text-[16px] transition-colors focus:outline-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setFilterMuscle(null); setActiveTab('recent'); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Muscle filter chips — shown on History tab and when searching */}
          {(search || activeTab === 'recent') && !selectedMuscle && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
              {['All', ...MUSCLE_GROUPS.map(m => m.name)].map((m) => {
                const isAll = m === 'All';
                const active = isAll ? filterMuscle === null : filterMuscle === m;
                const cssVar = isAll ? null : MUSCLE_CSS_VAR[m];
                return (
                  <button
                    key={m}
                    onClick={() => setFilterMuscle(isAll ? null : m === filterMuscle ? null : m)}
                    className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                    style={active
                      ? { background: cssVar ? `color-mix(in srgb, var(${cssVar}) 18%, transparent)` : 'rgba(200,255,0,0.12)', color: cssVar ? `var(${cssVar})` : 'var(--accent)', border: `1px solid ${cssVar ? `color-mix(in srgb, var(${cssVar}) 35%, transparent)` : 'rgba(200,255,0,0.3)'}` }
                      : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid transparent' }
                    }
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tabs — hidden when searching */}
          {!search && (
            <div className="flex gap-1.5 rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }}>
              {[
                { id: 'recent', label: 'History',  Icon: History       },
                { id: 'muscle', label: 'Muscle',   Icon: LayoutGrid    },
                { id: 'plans',  label: 'My Plans', Icon: ClipboardList },
              ].map(({ id, label, Icon }) => {
                const isActive = activeTab === id && !search;
                return (
                  <button
                    key={id}
                    onClick={() => { setActiveTab(id as any); setSearch(''); setSelectedMuscle(null); setFilterMuscle(null); }}
                    className="flex-1 h-8 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all"
                    style={isActive ? { background: 'var(--accent)', color: '#000' } : { background: 'transparent', color: 'var(--text-secondary)' }}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+88px)]">

          {/* Recent tab */}
          {activeTab === 'recent' && !search && (
            <div className="flex flex-col gap-3">
              {recentLoading && recentLibraryExercises.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-full rounded-xl flex items-center gap-3 px-3 py-2.5 animate-pulse"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', minHeight: 60 }}
                    >
                      <div className="h-10 w-10 rounded-xl shrink-0" style={{ background: 'var(--bg-elevated)' }} />
                      <div className="flex-1 flex flex-col gap-2">
                        <div className="h-3 rounded-full w-2/3" style={{ background: 'var(--bg-elevated)' }} />
                        <div className="h-2.5 rounded-full w-1/3" style={{ background: 'var(--bg-elevated)' }} />
                      </div>
                    </div>
                  ))
                : (() => {
                    const raw = recentExercises.length > 0 ? recentExercises : recentLibraryExercises;
                    const list = filterMuscle ? raw.filter(ex => ex.muscleGroup === filterMuscle) : raw;
                    if (list.length === 0 && filterMuscle) {
                      return (
                        <div className="flex flex-col items-center gap-2 py-12 text-center">
                          <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>No {filterMuscle} exercises logged yet</p>
                          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Log a {filterMuscle} workout and it will show up here</p>
                        </div>
                      );
                    }
                    // Group by muscle (skip grouping header when a single muscle is filtered)
                    if (filterMuscle) {
                      return list.map(exercise => (
                        <ExerciseRow key={exercise.id} exercise={exercise} isSelected={selectedMap.has(exercise.name)} onToggle={handleToggle} weightUnit={weightUnit} />
                      ));
                    }
                    const groups = new Map<string, Exercise[]>();
                    list.forEach(ex => {
                      const g = ex.muscleGroup || 'Other';
                      if (!groups.has(g)) groups.set(g, []);
                      groups.get(g)!.push(ex);
                    });
                    return Array.from(groups.entries()).map(([group, exercises]) => {
                      const cssVar = MUSCLE_CSS_VAR[group] ?? '--text-muted';
                      return (
                        <div key={group} className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 px-1">
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: `var(${cssVar})` }}>{group}</span>
                            <div className="flex-1 h-px" style={{ background: `color-mix(in srgb, var(${cssVar}) 20%, transparent)` }} />
                          </div>
                          {exercises.map(exercise => (
                            <ExerciseRow key={exercise.id} exercise={exercise} isSelected={selectedMap.has(exercise.name)} onToggle={handleToggle} weightUnit={weightUnit} />
                          ))}
                        </div>
                      );
                    });
                  })()
              }
              {!recentLoading && recentExercises.length === 0 && recentLibraryExercises.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <History className="w-8 h-8 opacity-30" style={{ color: 'var(--text-muted)' }} />
                  <div>
                    <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No exercise history yet</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Every exercise you log will appear here</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('muscle')}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-xl text-[12px] font-semibold transition-all active:scale-95"
                    style={{ background: 'var(--accent)', color: '#000' }}
                  >
                    Browse exercises
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Muscle grid */}
          {activeTab === 'muscle' && !search && !selectedMuscle && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {MUSCLE_GROUPS.map((muscle) => (
                <button
                  key={muscle.name}
                  onClick={() => setSelectedMuscle(muscle.name)}
                  className="relative h-[88px] rounded-2xl flex flex-col items-center justify-center gap-2 overflow-hidden active:scale-[0.97] transition-transform"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                >
                  <InitialBadge label={muscle.name} colorVar={muscle.cssVar} size="md" />
                  <span className="relative z-10 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: `var(${muscle.cssVar})` }}>
                    {muscle.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Muscle drill-down */}
          {selectedMuscle && !search && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setSelectedMuscle(null)}
                className="inline-flex items-center gap-1.5 mb-1 text-[12px] font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                All muscle groups
              </button>
              <div
                className="self-start mb-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{
                  background: `color-mix(in srgb, var(${MUSCLE_CSS_VAR[selectedMuscle] ?? '--text-muted'}) 12%, transparent)`,
                  color: `var(${MUSCLE_CSS_VAR[selectedMuscle] ?? '--text-muted'})`,
                  border: `1px solid color-mix(in srgb, var(${MUSCLE_CSS_VAR[selectedMuscle] ?? '--text-muted'}) 25%, transparent)`,
                }}
              >
                {selectedMuscle}
              </div>
              {filteredExercises.map((exercise) => (
                <ExerciseRow key={exercise.id} exercise={exercise} isSelected={selectedMap.has(exercise.name)} onToggle={handleToggle} weightUnit={weightUnit} />
              ))}
              {filteredExercises.length === 0 && (
                <div className="py-12 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  No exercises found
                </div>
              )}
            </div>
          )}

          {/* Search results */}
          {search && (
            <div className="flex flex-col gap-2">
              {filteredExercises.map((exercise) => (
                <ExerciseRow key={exercise.id} exercise={exercise} isSelected={selectedMap.has(exercise.name)} onToggle={handleToggle} weightUnit={weightUnit} />
              ))}
              {filteredExercises.length === 0 && (
                <div className="py-12 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
                  No results for "{search}"
                </div>
              )}
            </div>
          )}

          {/* My Plans tab */}
          {activeTab === 'plans' && !search && (
            <div className="flex flex-col gap-2">
              {templatesLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[68px] rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
                  ))}
                </div>
              )}

              {!templatesLoading && templates.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center" style={{ color: 'var(--text-muted)' }}>
                  <ClipboardList className="w-8 h-8 opacity-40" />
                  <p className="text-[13px] font-medium">No plans yet</p>
                  <p className="text-[11px] opacity-60">Close this and tap "Plan Today" to create your first plan</p>
                </div>
              )}

              {!templatesLoading && templates.map((tmpl) => {
                const exCount = tmpl.template_exercises?.length || 0;
                const preview = (tmpl.template_exercises || []).slice(0, 3).map((e) => e.name).join(', ');
                return (
                  <div
                    key={tmpl.id}
                    className="flex items-center gap-2 px-3 py-3 rounded-xl"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                  >
                    {/* Icon */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.15)' }}
                    >
                      <ClipboardList className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {tmpl.title}
                      </p>
                      <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {exCount} exercise{exCount !== 1 ? 's' : ''}{preview ? ` · ${preview}` : ''}
                      </p>
                    </div>

                    {/* Edit */}
                    {onEditTemplate && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEditTemplate(tmpl); onClose(); }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 active:scale-95 transition-transform"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        title="Edit plan"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={(e) => handleDeletePlan(tmpl.id, e)}
                      disabled={deletingId === tmpl.id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 active:scale-95 transition-transform disabled:opacity-40"
                      style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}
                      title="Delete plan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Start / Load — always visible */}
                    <button
                      type="button"
                      onClick={() => {
                        const exs = templateToExercises(tmpl);
                        if (onLoadPlan) { onLoadPlan(tmpl); onClose(); }
                        else if (onStartTemplate) { onStartTemplate(exs, tmpl.title); onClose(); }
                        else if (onLoadTemplate) { onLoadTemplate(exs, tmpl.title); onClose(); }
                        else { exs.forEach((ex) => onSelect(ex)); onClose(); }
                      }}
                      className="flex h-8 items-center gap-1.5 px-3 rounded-lg shrink-0 text-[11px] font-bold active:scale-95 transition-transform text-black"
                      style={{ background: 'var(--accent)' }}
                      title={onLoadPlan ? 'Load plan' : onStartTemplate ? 'Start workout' : onLoadTemplate ? 'Load exercises' : 'Add exercises'}
                    >
                      <Play className="w-3 h-3 fill-black" />
                      {onLoadPlan ? 'Load' : onStartTemplate ? 'Start' : onLoadTemplate ? 'Load' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Create Exercise sticky footer ── */}
        <div
          className="shrink-0 px-4 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-base)' }}
        >
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-[13px] font-semibold transition-all active:scale-[0.99] cursor-pointer"
            style={{
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              color: 'var(--accent)',
            }}
          >
            <Dumbbell className="w-4 h-4" />
            Create Custom Exercise
          </button>
        </div>

        {/* ── Multi-select sticky footer ── */}
        {selectedMap.size > 0 && (
          <div
            className="shrink-0 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]"
            style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}
          >
            <button
              onClick={handleAddSelected}
              className="w-full py-4 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 active:opacity-90 transition-opacity"
              style={{ background: 'var(--accent)' }}
            >
              <Check className="w-4 h-4" />
              Add {selectedMap.size} Exercise{selectedMap.size > 1 ? 's' : ''}
            </button>
          </div>
        )}
      </motion.div>

      {/* ── Create Exercise sheet (stacked above picker) ── */}
      <AnimatePresence>
        {showCreate && (
          <CreateExerciseSheet
            onClose={() => setShowCreate(false)}
            onCreated={(exercise) => {
              onSelect({
                id: exercise.id,
                name: exercise.name,
                muscleGroup: exercise.muscleGroup,
                inputTypeOverride: exercise.inputTypeOverride || undefined,
              });
              onClose();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

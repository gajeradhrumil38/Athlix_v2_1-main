import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, ArrowRight, CalendarPlus, Pencil, Trash2, Play, ChevronRight, RotateCcw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useExerciseOverrides } from '../../contexts/ExerciseOverridesContext';
import type { ExerciseEntry } from '../../pages/Log';
import { buildExercisesFromWorkout, getTemplates, deleteTemplate, getWorkouts } from '../../lib/supabaseData';
import { parseDateAtStartOfDay } from '../../lib/dates';
import { muscleColor } from '../../lib/muscleColors';
import { resolveEffectiveInputType } from '../../lib/exerciseTypes';
import toast from 'react-hot-toast';

const fmtRelativeDate = (workout: any): string => {
  const d = parseDateAtStartOfDay(workout.date);
  if (!d) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

interface QuickStartSheetProps {
  onStartEmpty: () => void;
  onStartTemplate: (exercises: ExerciseEntry[], title: string) => void;
  onPlanToday?: () => void;
  onEditTemplate?: (template: any) => void;
}

export const QuickStartSheet: React.FC<QuickStartSheetProps> = ({
  onStartEmpty,
  onStartTemplate,
  onPlanToday,
  onEditTemplate,
}) => {
  const { user } = useAuth();
  const { overrides: typeOverrides } = useExerciseOverrides();
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const seedPlannedTargets = (exerciseName: string, weight: number, reps: number) => {
    const inputType = resolveEffectiveInputType(exerciseName, typeOverrides);
    if (inputType !== 'weight_reps') {
      return { planned_weight: null, planned_reps: null };
    }
    return { planned_weight: weight, planned_reps: reps };
  };

  const fetchData = async () => {
    if (!user) { setLoading(false); return; }
    const [workoutData, templateData] = await Promise.all([
      getWorkouts(user.id, { includeExercises: true, limit: 5 }),
      getTemplates(user.id),
    ]);
    if (workoutData) setRecentWorkouts(workoutData);
    if (templateData) {
      // Deduplicate by id in case of server-side duplicates
      const seen = new Set<string>();
      const unique = (templateData as any[]).filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      setTemplates(unique);
    }
    setLoading(false);
  };

  // Re-fetch every time this sheet mounts (covers the case where a plan was created/edited
  // while PlanTodaySheet was open and QuickStartSheet was unmounted)
  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadRecent = async (workout: any) => {
    if (!user) return;
    const sourceExercises = await buildExercisesFromWorkout(user.id, workout.id);
    const exercises: ExerciseEntry[] = sourceExercises.map((ex) => ({
      id: crypto.randomUUID(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      exercise_db_id: ex.exercise_db_id || undefined,
      sets: ex.sets.map((set) => ({
        id: crypto.randomUUID(),
        weight: set.weight,
        reps: set.reps,
        done: false,
        ...seedPlannedTargets(ex.name, set.weight, set.reps),
      })),
    }));
    onStartTemplate(exercises, workout.title);
  };

  const handleStartTemplate = (template: any) => {
    const exercises: ExerciseEntry[] = template.template_exercises.map((ex: any) => ({
      id: crypto.randomUUID(),
      name: ex.name,
      muscleGroup: ex.muscle_group || ex.muscleGroup || 'Core',
      exercise_db_id: ex.exercise_db_id || undefined,
      sets: Array.from({ length: ex.default_sets || 3 }).map(() => ({
        id: crypto.randomUUID(),
        weight: ex.default_weight || 0,
        reps: ex.default_reps || 0,
        done: false,
        ...seedPlannedTargets(ex.name, ex.default_weight || 0, ex.default_reps || 0),
      })),
    }));
    onStartTemplate(exercises, template.title);
  };

  const handleDeleteTemplate = async (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    setDeletingId(templateId);
    try {
      await deleteTemplate(user.id, templateId);
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      toast.success('Plan deleted');
    } catch {
      toast.error('Failed to delete plan');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-[480px] lg-sheet rounded-t-[24px] flex flex-col"
        style={{ maxHeight: '88%', borderTop: '1px solid rgba(255,255,255,0.13)' }}
      >
        <div className="shrink-0 pt-3 pb-4 px-6 border-b border-[var(--border)]">
          <div className="lg-handle" />
          <h2 className="text-[15px] font-bold text-[var(--text-primary)]">Start Workout</h2>
          <p className="text-[11px] text-[var(--text-secondary)]">What are you training today?</p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4 space-y-6 pb-[max(24px,env(safe-area-inset-bottom))]">

          {/* ── Repeat Last Workout ── */}
          {!loading && recentWorkouts.length > 0 && (() => {
            const last = recentWorkouts[0];
            const muscles = Array.from(new Set((last.exercises || []).map((e: any) => e.muscle_group).filter(Boolean))) as string[];
            const exNames = (last.exercises || []).slice(0, 3).map((e: any) => e.name).filter(Boolean);
            return (
              <button
                onClick={() => handleLoadRecent(last)}
                className="w-full text-left rounded-2xl p-4 active:scale-[0.98] transition-all"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(200,255,0,0.1)' }}>
                      <RotateCcw className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[1.2px]" style={{ color: 'var(--text-muted)' }}>Repeat Last</p>
                      <p className="text-[14px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>{last.title || 'Workout'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>{fmtRelativeDate(last)}</span>
                    <div
                      className="px-2.5 py-1 rounded-lg text-[12px] font-bold text-black"
                      style={{ background: 'var(--accent)' }}
                    >
                      Start →
                    </div>
                  </div>
                </div>
                {/* Muscle chips */}
                {muscles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {muscles.slice(0, 4).map((mg) => (
                      <span key={mg} className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                        style={{ color: muscleColor(mg), background: `color-mix(in srgb, ${muscleColor(mg)} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${muscleColor(mg)} 22%, transparent)` }}>
                        {mg}
                      </span>
                    ))}
                    {exNames.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[9px]" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>
                        {exNames.join(' · ')}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })()}

          {/* Primary actions */}
          <div className="flex gap-2">
            <button
              onClick={onStartEmpty}
              className="flex-1 py-3.5 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2 text-black"
              style={{ background: 'var(--accent)' }}
            >
              Start Empty <ArrowRight className="w-4 h-4" />
            </button>
            {onPlanToday && (
              <button
                onClick={onPlanToday}
                className="btn-glow btn-glow-accent flex-1 py-3.5 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <CalendarPlus className="w-4 h-4 text-[var(--accent)]" />
                Plan Today
              </button>
            )}
          </div>

          {/* ── My Plans ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: 'var(--text-muted)' }}>
                My Plans
              </p>
              {onPlanToday && (
                <button
                  onClick={onPlanToday}
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--accent)' }}
                >
                  + New
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-[64px] rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
                ))}
              </div>
            ) : templates.length === 0 ? (
              <button
                onClick={onPlanToday}
                className="w-full py-5 rounded-xl border border-dashed flex flex-col items-center gap-1.5 active:opacity-70 transition-opacity"
                style={{ borderColor: 'rgba(200,255,0,0.2)', background: 'rgba(200,255,0,0.04)' }}
              >
                <ClipboardList className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>Create your first plan</span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Plans sync across all your devices</span>
              </button>
            ) : (
              <AnimatePresence initial={false}>
                <div className="space-y-2">
                  {templates.map((tmpl) => {
                    const exCount = tmpl.template_exercises?.length || 0;
                    const preview = (tmpl.template_exercises || []).slice(0, 2).map((e: any) => e.name).join(', ');
                    return (
                      <motion.div
                        key={tmpl.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        className="flex items-center gap-2 px-3 py-3 rounded-xl"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
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
                            onClick={(e) => { e.stopPropagation(); onEditTemplate(tmpl); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 active:scale-95 transition-transform"
                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                            title="Edit plan"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTemplate(tmpl.id, e)}
                          disabled={deletingId === tmpl.id}
                          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0 active:scale-95 transition-transform disabled:opacity-40"
                          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}
                          title="Delete plan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Start */}
                        <button
                          type="button"
                          onClick={() => handleStartTemplate(tmpl)}
                          className="flex h-8 items-center gap-1.5 px-3 rounded-lg shrink-0 text-[11px] font-bold active:scale-95 transition-transform text-black"
                          style={{ background: 'var(--accent)' }}
                          title="Start workout"
                        >
                          <Play className="w-3 h-3 fill-black" />
                          Start
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              </AnimatePresence>
            )}
          </div>

          {/* ── More Recent Workouts (2–5) ── */}
          {recentWorkouts.length > 1 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1.5px] mb-2" style={{ color: 'var(--text-muted)' }}>
                More Recent
              </p>
              <div className="space-y-1.5">
                {recentWorkouts.slice(1, 4).map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleLoadRecent(w)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:scale-[0.98] transition-transform"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{w.title}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {fmtRelativeDate(w)} · {w.exercises?.length || 0} exercises
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

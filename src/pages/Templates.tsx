import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { Plus, Trash2, Play, Edit2, Dumbbell } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExerciseImage } from '../components/shared/ExerciseImage';
import { deleteTemplate, getTemplates } from '../lib/supabaseData';
import { PlanTodaySheet } from '../components/log/PlanTodaySheet';
import { muscleColor } from '../lib/muscleColors';
import type { ExerciseEntry } from './Log';

interface TemplateExercise {
  id: string;
  name: string;
  muscle_group?: string;
  default_sets: number;
  default_reps: number;
  default_weight: number;
  exercise_db_id?: string;
  order_index?: number;
}

interface Template {
  id: string;
  title: string;
  template_exercises: TemplateExercise[];
}

const Skeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="skeleton rounded-2xl" style={{ height: 100 }} />
    ))}
  </div>
);

export const Templates: React.FC = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showSheet, setShowSheet] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, [user]);

  const fetchTemplates = async () => {
    if (!user) { setTemplates([]); setLoading(false); return; }
    try {
      const data = await getTemplates(user.id);
      setTemplates(data || []);
    } catch {
      toast.error('Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this plan?')) return;
    try {
      if (!user) throw new Error('Not signed in');
      await deleteTemplate(user.id, id);
      toast.success('Plan deleted');
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast.error('Failed to delete plan');
    }
  };

  const openCreate = () => {
    setEditingTemplate(null);
    setShowSheet(true);
  };

  const openEdit = (tmpl: Template) => {
    setEditingTemplate(tmpl);
    setShowSheet(true);
  };

  const handleSheetClose = () => {
    setShowSheet(false);
    setEditingTemplate(null);
    // Refresh list in case exercises were changed and saved
    fetchTemplates();
  };

  const handleSheetStart = (_exercises: ExerciseEntry[], _title: string) => {
    // From Templates page "Start" just saves — no active workout context here
    toast.success('Plan saved!');
    setShowSheet(false);
    setEditingTemplate(null);
    fetchTemplates();
  };

  // Build initialTemplate shape for PlanTodaySheet
  const sheetTemplate = editingTemplate
    ? {
        id: editingTemplate.id,
        title: editingTemplate.title,
        exercises: (editingTemplate.template_exercises || [])
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map((ex) => ({
            id: ex.id,
            name: ex.name,
            muscleGroup: ex.muscle_group ?? '',
            exercise_db_id: ex.exercise_db_id,
            sets: Array.from({ length: ex.default_sets || 3 }, () => ({
              weight: ex.default_weight ?? 0,
              reps: ex.default_reps ?? 10,
            })),
          })),
      }
    : undefined;

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 px-1">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>My Plans</h1>
          {templates.length > 0 && (
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {templates.length} plan{templates.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all active:scale-95"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          <Plus className="w-4 h-4" />
          New Plan
        </button>
      </div>

      {loading ? (
        <Skeleton />
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div
            className="mb-4 h-14 w-14 flex items-center justify-center rounded-2xl"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <Dumbbell className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>No plans yet</p>
          <p className="text-[12px] mt-1 max-w-[220px]" style={{ color: 'var(--text-muted)' }}>
            Create a plan to quickly start a workout with your favourite exercises.
          </p>
          <button
            onClick={openCreate}
            className="mt-5 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            <Plus className="w-4 h-4" />
            Create your first plan
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {templates.map((tmpl) => {
              const exs = (tmpl.template_exercises || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
              const totalSets = exs.reduce((s, e) => s + (e.default_sets || 0), 0);
              const muscles = Array.from(new Set(exs.map((e) => e.muscle_group).filter(Boolean))) as string[];

              return (
                <motion.div
                  key={tmpl.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="rounded-2xl overflow-hidden"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                >
                  {/* Accent bar using first muscle group color */}
                  <div
                    className="h-[3px]"
                    style={{ background: muscles[0] ? muscleColor(muscles[0]) : 'var(--accent)' }}
                  />

                  <div className="px-4 pt-3 pb-4">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[16px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                          {tmpl.title}
                        </h3>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {exs.length} exercise{exs.length !== 1 ? 's' : ''} · {totalSets} sets
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => openEdit(tmpl)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg transition-all active:scale-95"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                          aria-label="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(tmpl.id)}
                          className="h-8 w-8 flex items-center justify-center rounded-lg transition-all active:scale-95"
                          style={{ background: 'rgba(255,59,48,0.07)', color: 'rgba(255,59,48,0.8)', border: '1px solid rgba(255,59,48,0.15)' }}
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Muscle group pills */}
                    {muscles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {muscles.map((mg) => (
                          <span
                            key={mg}
                            className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                            style={{
                              color: muscleColor(mg),
                              background: `color-mix(in srgb, ${muscleColor(mg)} 10%, transparent)`,
                              border: `1px solid color-mix(in srgb, ${muscleColor(mg)} 20%, transparent)`,
                            }}
                          >
                            {mg}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Exercise preview chips */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {exs.slice(0, 4).map((ex) => (
                        <div
                          key={ex.id}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                        >
                          {ex.exercise_db_id ? (
                            <ExerciseImage exerciseId={ex.exercise_db_id} exerciseName={ex.name} size="sm" />
                          ) : (
                            <div
                              className="h-4 w-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0"
                              style={{ background: muscleColor(ex.muscle_group ?? ''), color: '#000' }}
                            >
                              {ex.name?.charAt(0)}
                            </div>
                          )}
                          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                            {ex.name}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {ex.default_sets}×{ex.default_reps}
                          </span>
                        </div>
                      ))}
                      {exs.length > 4 && (
                        <div
                          className="px-2 py-1 rounded-lg text-[11px]"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                        >
                          +{exs.length - 4} more
                        </div>
                      )}
                    </div>

                    {/* Start button */}
                    <button
                      onClick={() => openEdit(tmpl)}
                      className="w-full py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                      style={{ background: 'var(--accent)', color: '#000' }}
                    >
                      <Play className="w-3.5 h-3.5 fill-black" />
                      Start Workout
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* PlanTodaySheet for create / edit */}
      <AnimatePresence>
        {showSheet && (
          <PlanTodaySheet
            key={editingTemplate?.id ?? 'new'}
            onClose={handleSheetClose}
            onStartPlan={handleSheetStart}
            initialTemplate={sheetTemplate}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

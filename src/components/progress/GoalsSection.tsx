import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Trophy, X } from 'lucide-react';
import { getGoals, addGoal, deleteGoal, getPersonalRecords, type LocalExerciseGoal, type LocalPersonalRecord } from '../../lib/supabaseData';
import toast from 'react-hot-toast';

interface GoalsSectionProps {
  userId: string;
  weightUnit: 'kg' | 'lbs';
}

export const GoalsSection: React.FC<GoalsSectionProps> = ({ userId, weightUnit }) => {
  const [goals, setGoals] = useState<LocalExerciseGoal[]>([]);
  const [records, setRecords] = useState<LocalPersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getGoals(userId), getPersonalRecords(userId)])
      .then(([g, r]) => { setGoals(g); setRecords(r); })
      .catch(() => toast.error('Failed to load goals'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    const trimmedName = name.trim();
    const targetWeight = Number(weight);
    const targetReps = Number(reps);
    if (!trimmedName || !(targetWeight > 0) || !(targetReps > 0)) {
      toast.error('Fill in exercise, weight, and reps.');
      return;
    }
    setSaving(true);
    try {
      await addGoal(userId, { exerciseName: trimmedName, targetWeight, targetReps, unit: weightUnit });
      setName(''); setWeight(''); setReps(''); setShowAdd(false);
      load();
      toast.success('Goal added');
    } catch {
      toast.error('Failed to add goal');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (goalId: string) => {
    try {
      await deleteGoal(userId, goalId);
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
    } catch {
      toast.error('Failed to remove goal');
    }
  };

  if (loading) {
    return <div className="p-4 space-y-2">{[1, 2].map((i) => <div key={i} className="h-20 rounded-xl animate-pulse bg-white/5" />)}</div>;
  }

  const active = goals.filter((g) => g.status === 'active');
  const achieved = goals.filter((g) => g.status === 'achieved');

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Strength Goals</h3>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-bold cursor-pointer"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cancel' : 'Add Goal'}
        </button>
      </div>

      {showAdd && (
        <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <input
            type="text"
            placeholder="Exercise name (e.g. Bench Press)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 rounded-lg px-3 text-[13px]"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder={`Target weight (${weightUnit})`}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-10 rounded-lg px-3 text-[13px]"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <input
              type="number"
              placeholder="Target reps"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="h-10 rounded-lg px-3 text-[13px]"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleAdd}
            className="w-full h-10 rounded-lg text-[13px] font-bold disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {saving ? 'Saving…' : 'Save Goal'}
          </button>
        </div>
      )}

      {active.length === 0 && !showAdd && (
        <div className="p-6 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
          No active goals yet. Set a strength target on any exercise to track progress toward it.
        </div>
      )}

      {active.map((goal) => {
        const pr = records.find((r) => r.exercise_name.toLowerCase() === goal.exercise_name.toLowerCase());
        const currentWeight = pr?.best_weight ?? 0;
        const progressPct = Math.min(100, Math.round((currentWeight / goal.target_weight) * 100));
        return (
          <div key={goal.id} className="p-4 rounded-2xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{goal.exercise_name}</span>
              <button type="button" onClick={() => handleDelete(goal.id)} className="text-[var(--text-muted)] cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: 'var(--accent)' }} />
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {currentWeight}{goal.unit} → {goal.target_weight}{goal.unit} × {goal.target_reps} · {progressPct}%
            </div>
          </div>
        );
      })}

      {achieved.length > 0 && (
        <div className="pt-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Achieved</h4>
          {achieved.map((goal) => (
            <div key={goal.id} className="flex items-center gap-2 p-3 rounded-xl mb-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <Trophy className="w-4 h-4" style={{ color: 'var(--pr-gold)' }} />
              <span className="text-[12px] font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                {goal.exercise_name} — {goal.target_weight}{goal.unit} × {goal.target_reps}
              </span>
              <button type="button" onClick={() => handleDelete(goal.id)} className="text-[var(--text-muted)] cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

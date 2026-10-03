import { describe, expect, it } from 'vitest';
import type { ExerciseEntry, WorkoutState } from '../pages/Log';
import {
  addExercises, addSet, copySet, exerciseDone, exerciseSummary, markExerciseDone, markExerciseUndone,
  removeSet, sessionProgress, setsToSave, toggleSetDone, updateSetValue,
} from './sessionChecklist';

const set = (id: string, over: Partial<ExerciseEntry['sets'][number]> = {}) => ({
  id, weight: null, reps: null, done: false, planned_weight: 135, planned_reps: 10, ...over,
});
const ex = (id: string, name: string, sets = [set(`${id}a`), set(`${id}b`), set(`${id}c`)]): ExerciseEntry =>
  ({ id, name, muscleGroup: 'Chest', sets });
const w = (exercises: ExerciseEntry[]): WorkoutState =>
  ({ title: 'Push', startTime: 0, startAt: '', endAt: '', elapsedSeconds: 0, exercises, notes: '' });

describe('markExerciseDone / Undone', () => {
  it('fills empty values from the prescription and ticks every set', () => {
    const out = markExerciseDone(w([ex('e1', 'Bench Press')]), 'e1');
    expect(out.exercises[0].sets.every((s) => s.done && s.weight === 135 && s.reps === 10)).toBe(true);
  });
  it('keeps values the trainee already entered', () => {
    const out = markExerciseDone(w([ex('e1', 'Bench', [set('a', { weight: 140, reps: 8 })])]), 'e1');
    expect(out.exercises[0].sets[0]).toMatchObject({ weight: 140, reps: 8, done: true });
  });
  it('undo unticks but keeps numbers', () => {
    const done = markExerciseDone(w([ex('e1', 'Bench')]), 'e1');
    const out = markExerciseUndone(done, 'e1');
    expect(out.exercises[0].sets.every((s) => !s.done && s.weight === 135)).toBe(true);
  });
});

describe('sessionProgress', () => {
  it('counts fully done exercises and finds the next one', () => {
    const s = markExerciseDone(w([ex('e1', 'A'), ex('e2', 'B'), ex('e3', 'C')]), 'e1');
    expect(sessionProgress(s)).toEqual({ done: 1, total: 3, nextIndex: 1, anySetDone: true });
  });
  it('treats a partly ticked exercise as not done', () => {
    const s = toggleSetDone(w([ex('e1', 'A')]), 'e1', 'e1a');
    expect(exerciseDone(s.exercises[0])).toBe(false);
    expect(sessionProgress(s)).toEqual({ done: 0, total: 1, nextIndex: 0, anySetDone: true });
  });
  it('reports nextIndex -1 when everything is done', () => {
    const s = markExerciseDone(w([ex('e1', 'A')]), 'e1');
    expect(sessionProgress(s).nextIndex).toBe(-1);
  });
});

describe('set edits', () => {
  it('toggleSetDone fills from the prescription', () => {
    const s = toggleSetDone(w([ex('e1', 'A')]), 'e1', 'e1b');
    expect(s.exercises[0].sets[1]).toMatchObject({ done: true, weight: 135, reps: 10 });
  });
  it('updateSetValue clamps at zero', () => {
    const s = updateSetValue(w([ex('e1', 'A')]), 'e1', 'e1a', 'weight', -5);
    expect(s.exercises[0].sets[0].weight).toBe(0);
  });
  it('addSet copies the last set, not done', () => {
    const base = updateSetValue(w([ex('e1', 'A')]), 'e1', 'e1c', 'weight', 150);
    const s = addSet(base, 'e1', 'new');
    expect(s.exercises[0].sets).toHaveLength(4);
    expect(s.exercises[0].sets[3]).toMatchObject({ id: 'new', weight: 150, reps: 10, done: false });
  });
  it('removeSet keeps at least one set', () => {
    const one = w([ex('e1', 'A', [set('only')])]);
    expect(removeSet(one, 'e1', 'only').exercises[0].sets).toHaveLength(1);
    expect(removeSet(w([ex('e1', 'A')]), 'e1', 'e1a').exercises[0].sets.map((x) => x.id)).toEqual(['e1b', 'e1c']);
  });
});

describe('addExercises', () => {
  it('appends new exercises and skips names already in the session', () => {
    const s = addExercises(w([ex('e1', 'Bench Press')]), [ex('x', 'bench press'), ex('y', 'Row')]);
    expect(s.exercises.map((e) => e.name)).toEqual(['Bench Press', 'Row']);
  });
});

describe('exerciseSummary', () => {
  it('collapses identical sets', () => {
    expect(exerciseSummary(ex('e1', 'A'))).toBe('3 × 10 @ 135 lb');
  });
  it('lists differing sets', () => {
    const e = ex('e1', 'A', [set('a', { weight: 135, reps: 10 }), set('b', { weight: 135, reps: 8 }), set('c', { weight: 125, reps: 8 })]);
    expect(exerciseSummary(e)).toBe('135×10 · 135×8 · 125×8');
  });
  it('omits weight for bodyweight work', () => {
    const e = ex('e1', 'Push-Ups', [set('a', { planned_weight: null, planned_reps: 15 }), set('b', { planned_weight: null, planned_reps: 15 })]);
    expect(exerciseSummary(e)).toBe('2 × 15');
  });
});

describe('setsToSave', () => {
  it('saves only ticked sets once any set is ticked', () => {
    const s = toggleSetDone(w([ex('e1', 'A'), ex('e2', 'B')]), 'e1', 'e1a');
    const out = setsToSave(s);
    expect(out.map((x) => x.exercise.name)).toEqual(['A']);
    expect(out[0].sets.map((x) => x.id)).toEqual(['e1a']);
  });
  it('saves every set with a value when nothing is ticked', () => {
    const s = updateSetValue(w([ex('e1', 'A')]), 'e1', 'e1a', 'weight', 100);
    expect(setsToSave(s)[0].sets.map((x) => x.id)).toEqual(['e1a']);
  });
  it('drops exercises with no values', () => {
    expect(setsToSave(w([ex('e1', 'A')]))).toEqual([]);
  });
});

describe('copySet', () => {
  it('inserts an un-ticked copy right after the set', () => {
    const base = toggleSetDone(updateSetValue(w([ex('e1', 'A')]), 'e1', 'e1a', 'weight', 150), 'e1', 'e1a');
    const s = copySet(base, 'e1', 'e1a', 'copy');
    expect(s.exercises[0].sets.map((x) => x.id)).toEqual(['e1a', 'copy', 'e1b', 'e1c']);
    expect(s.exercises[0].sets[1]).toMatchObject({ weight: 150, reps: 10, done: false });
  });
});

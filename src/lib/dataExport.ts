import {
  getWorkouts, getBodyWeightLogs, getPersonalRecords,
  type LocalWorkout, type LocalExercise, type LocalBodyWeightLog, type LocalPersonalRecord,
} from './supabaseData';
import { whoopService } from '../features/whoop/services/whoopService';

// "Export my data" — lets a user pull their own training history out as
// clean, per-entity CSVs. Two jobs: (1) plain data portability/ownership,
// (2) the raw material for the cold-start recommendation model — real
// workouts + WHOOP recovery/strain, structured the same way across
// whoever exports, so multiple users' exports can be pooled into one
// training set later. Raw BLE heart-rate samples (per-second, during a
// single session) are deliberately left out: high volume, low signal for
// "what should I train next", and not what either job needs.

type Column<T> = { header: string; value: (row: T) => string | number | null | undefined };

// RFC 4180 escaping — wrap in quotes whenever the value contains a comma,
// quote, or newline; double up any internal quotes.
const csvCell = (value: string | number | null | undefined): string => {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCSV<T>(rows: T[], columns: Column<T>[]): string {
  const header = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(','));
  return [header, ...body].join('\r\n');
}

function downloadCSV(filename: string, csv: string) {
  // Leading BOM so Excel (which guesses encoding without one) opens it as
  // UTF-8 instead of mangling anything non-ASCII in exercise names/notes.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ExportSummary { files: string[]; }

// Triggers one browser download per non-empty entity, staggered slightly so
// browsers don't treat a burst of near-simultaneous downloads as a popup
// storm and block the later ones.
export async function exportAllUserData(userId: string): Promise<ExportSummary> {
  const files: string[] = [];
  const stamp = new Date().toISOString().slice(0, 10);
  const emit = async (filename: string, csv: string) => {
    downloadCSV(filename, csv);
    files.push(filename);
    await wait(350);
  };

  const workouts = (await getWorkouts(userId, { includeExercises: true })) as (LocalWorkout & { exercises?: LocalExercise[] })[];

  if (workouts.length) {
    await emit(`athlix-workouts-${stamp}.csv`, toCSV(workouts, [
      { header: 'id', value: (w) => w.id },
      { header: 'date', value: (w) => w.date },
      { header: 'title', value: (w) => w.title },
      { header: 'duration_minutes', value: (w) => w.duration_minutes },
      { header: 'muscle_groups', value: (w) => (w.muscle_groups || []).join('|') },
      { header: 'notes', value: (w) => w.notes },
      { header: 'created_at', value: (w) => w.created_at },
    ]));

    const setRows = workouts.flatMap((w) => (w.exercises || []).map((e) => ({ workout: w, ex: e })));
    if (setRows.length) {
      await emit(`athlix-sets-${stamp}.csv`, toCSV(setRows, [
        { header: 'workout_id', value: (r) => r.workout.id },
        { header: 'workout_date', value: (r) => r.workout.date },
        { header: 'exercise_name', value: (r) => r.ex.name },
        { header: 'muscle_group', value: (r) => r.ex.muscle_group },
        { header: 'sets', value: (r) => r.ex.sets },
        { header: 'reps', value: (r) => r.ex.reps },
        { header: 'weight', value: (r) => r.ex.weight },
        { header: 'unit', value: (r) => r.ex.unit },
        { header: 'order_index', value: (r) => r.ex.order_index },
      ]));
    }
  }

  const prs = (await getPersonalRecords(userId)) as LocalPersonalRecord[];
  if (prs.length) {
    await emit(`athlix-personal-records-${stamp}.csv`, toCSV(prs, [
      { header: 'exercise_name', value: (r) => r.exercise_name },
      { header: 'best_weight', value: (r) => r.best_weight },
      { header: 'best_reps', value: (r) => r.best_reps },
      { header: 'unit', value: (r) => r.unit },
      { header: 'achieved_date', value: (r) => r.achieved_date },
    ]));
  }

  const bodyWeights = (await getBodyWeightLogs(userId)) as LocalBodyWeightLog[];
  if (bodyWeights.length) {
    await emit(`athlix-body-weight-${stamp}.csv`, toCSV(bodyWeights, [
      { header: 'date', value: (r) => r.date },
      { header: 'weight', value: (r) => r.weight },
      { header: 'unit', value: (r) => r.unit },
      { header: 'notes', value: (r) => r.notes },
    ]));
  }

  // WHOOP — only if actually connected; fetchAllFromCache returns empty
  // arrays rather than throwing when there's nothing linked.
  const whoop = await whoopService.fetchAllFromCache(userId).catch(() => null);
  if (whoop?.recovery.length) {
    await emit(`athlix-whoop-recovery-${stamp}.csv`, toCSV(whoop.recovery, [
      { header: 'date', value: (r) => r.date },
      { header: 'recovery_score', value: (r) => r.recovery_score },
      { header: 'hrv_rmssd_milli', value: (r) => r.hrv_rmssd_milli },
      { header: 'resting_heart_rate', value: (r) => r.resting_heart_rate },
      { header: 'spo2_percentage', value: (r) => r.spo2_percentage },
      { header: 'skin_temp_celsius', value: (r) => r.skin_temp_celsius },
    ]));
  }
  if (whoop?.sleep.length) {
    await emit(`athlix-whoop-sleep-${stamp}.csv`, toCSV(whoop.sleep, [
      { header: 'date', value: (r) => r.date },
      { header: 'sleep_performance_percentage', value: (r) => r.sleep_performance_percentage },
      { header: 'sleep_efficiency_percentage', value: (r) => r.sleep_efficiency_percentage },
      { header: 'total_in_bed_time_milli', value: (r) => r.total_in_bed_time_milli },
      { header: 'total_slow_wave_sleep_time_milli', value: (r) => r.total_slow_wave_sleep_time_milli },
      { header: 'total_rem_sleep_time_milli', value: (r) => r.total_rem_sleep_time_milli },
    ]));
  }
  if (whoop?.cycles.length) {
    await emit(`athlix-whoop-strain-${stamp}.csv`, toCSV(whoop.cycles, [
      { header: 'date', value: (r) => r.date },
      { header: 'strain_score', value: (r) => r.strain_score },
      { header: 'estimated_steps', value: (r) => r.estimated_steps },
      { header: 'raw_kilojoules', value: (r) => r.raw_kilojoules },
      { header: 'average_heart_rate', value: (r) => r.average_heart_rate },
      { header: 'max_heart_rate', value: (r) => r.max_heart_rate },
    ]));
  }

  return { files };
}

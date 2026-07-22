/**
 * Food scan CRUD — direct Supabase client calls, matching the project's
 * existing pattern in supabaseData.ts.
 */

import { supabase } from './supabase';
import type { FoodScan, FoodScanInsert, FoodScanUpdate } from '../features/food/types';

const TABLE = 'food_scans';

// ─── Read ──────────────────────────────────────────────────────────────────

/**
 * Fetch paginated scan history for the current user, newest first.
 * @param page   0-based page index
 * @param limit  rows per page
 */
export async function getFoodScans(
  userId: string,
  page = 0,
  limit = 20,
): Promise<{ scans: FoodScan[]; total: number }> {
  const from = page * limit;
  const to   = from + limit - 1;

  const { data, error, count } = await supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('scan_date', { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { scans: (data ?? []) as FoodScan[], total: count ?? 0 };
}

/**
 * Fetch a single scan by id. Throws if not found or no access.
 */
export async function getFoodScan(id: string): Promise<FoodScan> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as FoodScan;
}

// ─── Write ─────────────────────────────────────────────────────────────────

export async function saveFoodScan(
  userId: string,
  payload: FoodScanInsert,
): Promise<FoodScan> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: userId, ...payload })
    .select()
    .single();
  if (error) throw error;
  return data as FoodScan;
}

export async function updateFoodScan(
  id: string,
  updates: FoodScanUpdate,
): Promise<FoodScan> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as FoodScan;
}

export async function deleteFoodScan(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

// ─── Analytics helpers ─────────────────────────────────────────────────────

/** Total scans logged today (for the dashboard widget, if needed). */
export async function getTodayCalories(userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from(TABLE)
    .select('total_calories')
    .eq('user_id', userId)
    .gte('scan_date', todayStart.toISOString());

  if (error) return 0;
  return (data ?? []).reduce((s, r) => s + (r.total_calories ?? 0), 0);
}

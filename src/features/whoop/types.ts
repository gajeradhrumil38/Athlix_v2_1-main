export interface WhoopRecovery {
  date: string;
  recovery_score: number;
  hrv_rmssd_milli: number;
  resting_heart_rate: number;
  spo2_percentage?: number;
  skin_temp_celsius?: number;
  // WHOOP's own links — the sleep/cycle this recovery was computed from. Used to
  // match the day view's sleep/strain to the selected recovery TZ-immune, rather
  // than by fragile local-date strings (different anchors drift across midnight).
  cycle_id?: number;
  sleep_id?: string;
}

export interface WhoopSleep {
  date: string;
  id?: string;
  sleep_performance_percentage: number;
  sleep_efficiency_percentage: number;
  total_in_bed_time_milli: number;
  total_slow_wave_sleep_time_milli?: number;
  total_rem_sleep_time_milli?: number;
}

export interface WhoopHeartRate {
  timestamp: string;
  heart_rate_bpm: number;
}

export interface WhoopCycle {
  date: string;
  id?: number;
  estimated_steps: number;
  raw_kilojoules: number;
  strain_score?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
}

export interface WhoopWorkout {
  id: number;
  date: string;
  start: string;
  end: string;
  sport_id: number;
  sport_name: string;
  duration_milli: number;
  strain?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
  kilojoules?: number;
  distance_meter?: number;
  zone_durations?: {
    zone_zero: number;
    zone_one: number;
    zone_two: number;
    zone_three: number;
    zone_four: number;
    zone_five: number;
  };
}

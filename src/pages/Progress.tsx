import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useHeartRate, type HeartRateSample } from '../contexts/HeartRateContext';
import { useProgress } from '../contexts/ProgressContext';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfToday,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';

import { LineChart, AreaChart, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, ReferenceDot } from 'recharts';
import { Target, TrendingUp, Activity, Scale, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, CalendarDays, Pencil, Heart, Bluetooth, PlugZap, Unplug, Info, Flame, X, Camera, Utensils, History, Trophy } from 'lucide-react';
import { DopamineTracker } from '../components/progress/DopamineTracker';
import { GoalsSection } from '../components/progress/GoalsSection';
import { ExerciseHistorySearch } from '../components/progress/ExerciseHistorySearch';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

import {
  getBodyWeightLogs,
  getExerciseRowsWithWorkoutDates,
  getHeartRateSamples,

  getWorkouts,
  logBodyWeight,
  updateBodyWeightLog,
} from '../lib/supabaseData';
import type { LocalBodyWeightLog } from '../lib/supabaseData';
import { parseDateAtStartOfDay } from '../lib/dates';
import { convertWeight, isWeightUnit, type WeightUnit } from '../lib/units';
import { palette } from '../theme/colors';
import { getTodayCalories, getFoodScans } from '../lib/foodData';
import type { FoodScan } from '../features/food/types';

const HEART_RATE_ZONES = [
  { id: 'z1', name: 'Recovery', range: '50-94',   color: 'var(--back)'   },
  { id: 'z2', name: 'Easy',     range: '95-124',  color: 'var(--accent)' },
  { id: 'z3', name: 'Moderate', range: '125-154', color: 'var(--yellow)' },
  { id: 'z4', name: 'Hard',     range: '155-174', color: 'var(--legs)'   },
  { id: 'z5', name: 'Peak',     range: '175+',    color: 'var(--red)'    },
] as const;

const HEART_RATE_GAP_BREAK_MS = 5000;
const LIVE_WAVEFORM_RANGE_MS = 12 * 60 * 60 * 1000;
const DEFAULT_LIVE_WAVEFORM_WINDOW_MS = 15 * 60 * 1000;
const DAY_WAVEFORM_RANGE_MS = 24 * 60 * 60 * 1000;
const MIN_WAVEFORM_WINDOW_MS = 5 * 60 * 1000;
const MAX_WAVEFORM_CHART_POINTS = 180;
const HEART_RATE_HISTORY_LOOKBACK_DAYS = 45;

type HeartRateViewMode = 'live' | 'day' | 'week' | 'month';
const ZONE_SHORT_LABEL_BY_ID: Record<string, string> = {
  z1: 'Rec',
  z2: 'Easy',
  z3: 'Mod',
  z4: 'Hard',
  z5: 'Peak',
};

const getHeartRateZoneIndex = (bpm: number) => {
  if (bpm < 95) return 0;
  if (bpm < 125) return 1;
  if (bpm < 155) return 2;
  if (bpm < 175) return 3;
  return 4;
};

const getHeartRateZoneColor = (bpm: number | null) => {
  if (bpm == null || !Number.isFinite(bpm)) return 'rgba(255,255,255,0.14)';
  return HEART_RATE_ZONES[getHeartRateZoneIndex(bpm)].color;
};

const withAlpha = (color: string, alpha: number): string => {
  if (alpha <= 0) return 'transparent';
  const pct = Math.round(alpha * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
};

const averageHeartRateSamples = (samples: HeartRateSample[]) => {
  if (!samples.length) return null;
  return Math.round(samples.reduce((sum, sample) => sum + sample.bpm, 0) / samples.length);
};

const mergeHeartRateSamples = (stored: HeartRateSample[], live: HeartRateSample[]) => {
  const deduped = new Map<string, HeartRateSample>();
  [...stored, ...live]
    .sort((a, b) => a.ts - b.ts)
    .forEach((sample) => {
      deduped.set(`${sample.ts}:${sample.bpm}`, sample);
    });
  return Array.from(deduped.values()).sort((a, b) => a.ts - b.ts);
};

const aggregateHeartRateSamples = (
  samples: HeartRateSample[],
  startTs: number,
  endTs: number,
  targetPoints: number,
) => {
  if (!samples.length || endTs <= startTs) return [];

  const bucketMs = Math.max(1000, Math.ceil((endTs - startTs) / Math.max(1, targetPoints)));
  const buckets = new Map<number, HeartRateSample[]>();

  samples.forEach((sample) => {
    if (sample.ts < startTs || sample.ts > endTs) return;
    const bucketIndex = Math.floor((sample.ts - startTs) / bucketMs);
    const bucket = buckets.get(bucketIndex) || [];
    bucket.push(sample);
    buckets.set(bucketIndex, bucket);
  });

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucketIndex, bucket]) => {
      const avgBpm = averageHeartRateSamples(bucket);
      const centerTs = startTs + bucketIndex * bucketMs + Math.round(bucketMs / 2);
      return {
        ts: Math.min(endTs, centerTs),
        bpm: avgBpm ?? bucket[bucket.length - 1].bpm,
      };
    });
};

const buildHeartRateChartRows = (
  samples: HeartRateSample[],
  startTs: number,
  endTs: number,
  targetPoints: number,
) => {
  const aggregated = aggregateHeartRateSamples(samples, startTs, endTs, targetPoints);
  const rows: any[] = [];

  aggregated.forEach((item, index) => {
    const previous = aggregated[index - 1];
    if (previous) {
      const gapMs = item.ts - previous.ts;
      if (gapMs > HEART_RATE_GAP_BREAK_MS) {
        const gapStartTs = previous.ts + Math.min(2000, Math.round(gapMs * 0.14));
        const gapEndTs = item.ts - Math.min(2000, Math.round(gapMs * 0.14));
        const gapGuideStart: any = {
          idx: `${index}-gap-start`,
          ts: gapStartTs,
          bpm: null,
          gapGuide: previous.bpm,
          time: format(new Date(gapStartTs), 'h:mm:ss a'),
          zoneIndex: null,
          zoneLabel: 'No data',
          isGap: true,
        };
        const gapGuideEnd: any = {
          idx: `${index}-gap-end`,
          ts: gapEndTs,
          bpm: null,
          gapGuide: item.bpm,
          time: format(new Date(gapEndTs), 'h:mm:ss a'),
          zoneIndex: null,
          zoneLabel: 'No data',
          isGap: true,
        };
        HEART_RATE_ZONES.forEach((_, zoneIdx) => {
          gapGuideStart[`z${zoneIdx}`] = null;
          gapGuideEnd[`z${zoneIdx}`] = null;
        });
        rows.push(gapGuideStart, gapGuideEnd);
      }
    }

    const zoneIndex = getHeartRateZoneIndex(item.bpm);
    const row: any = {
      idx: index,
      ts: item.ts,
      bpm: item.bpm,
      gapGuide: null,
      time: format(new Date(item.ts), 'h:mm:ss a'),
      zoneIndex,
      zoneLabel: HEART_RATE_ZONES[zoneIndex].name,
      isGap: false,
    };
    HEART_RATE_ZONES.forEach((_, zoneIdx) => {
      row[`z${zoneIdx}`] = zoneIndex === zoneIdx ? item.bpm : null;
    });
    rows.push(row);
  });

  return rows;
};

const formatStoredDate = (value: unknown, pattern: string) => {
  const parsed = parseDateAtStartOfDay(value);
  return parsed ? format(parsed, pattern) : '--';
};

export const Progress: React.FC = () => {
  const { user, profile } = useAuth();
  const { startProgress, doneProgress } = useProgress();
  const displayUnit = profile?.unit_preference || 'lbs';
  const [activeTab, setActiveTab] = useState<'overview' | 'food' | 'dopamine' | 'goals' | 'weight' | 'livehr'>('livehr');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [todayCalories, setTodayCalories] = useState(0);
  const [recentScans, setRecentScans] = useState<FoodScan[]>([]);
  const [foodLoading, setFoodLoading] = useState(false);

  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [volumeMonth, setVolumeMonth] = useState(() => startOfMonth(new Date()));

  const [newWeight, setNewWeight] = useState('');
  const [weightDate, setWeightDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [weightChartView, setWeightChartView] = useState<'day' | 'week' | 'month'>('day');
  const [showEditEntries, setShowEditEntries] = useState(false);
  const [editEntry, setEditEntry] = useState<LocalBodyWeightLog | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [heightCm, setHeightCm] = useState(() => localStorage.getItem('athlix_height_cm') ?? '');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ftin'>(() =>
    (localStorage.getItem('athlix_height_unit') as 'cm' | 'ftin') ?? 'cm',
  );
  const [heightFt, setHeightFt] = useState(() => {
    const cm = parseFloat(localStorage.getItem('athlix_height_cm') ?? '');
    if (!cm) return '';
    const totalIn = cm / 2.54;
    return String(Math.floor(totalIn / 12));
  });
  const [heightIn, setHeightIn] = useState(() => {
    const cm = parseFloat(localStorage.getItem('athlix_height_cm') ?? '');
    if (!cm) return '';
    const totalIn = cm / 2.54;
    return (totalIn % 12).toFixed(1);
  });
  const [heightEditing, setHeightEditing] = useState(() => !localStorage.getItem('athlix_height_cm'));
  const [showBmiInfo, setShowBmiInfo] = useState(false);
  const [bmiValue, setBmiValue] = useState<string | null>(null);
  const {
    supportsWebBluetooth,
    hrConnecting,
    hrConnected,
    hrError,
    hrDeviceName,
    hrSamples,
    connectHeartRate,
    disconnectHeartRate,
  } = useHeartRate();
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<number | null>(null);
  const [heartRateView, setHeartRateView] = useState<HeartRateViewMode>('live');
  const [storedHeartRateSamples, setStoredHeartRateSamples] = useState<HeartRateSample[]>([]);
  const [waveformWindowDurationMs, setWaveformWindowDurationMs] = useState(DEFAULT_LIVE_WAVEFORM_WINDOW_MS);
  const [waveformViewportEndTs, setWaveformViewportEndTs] = useState<number | null>(null);
  const [waveformAtLive, setWaveformAtLive] = useState(true);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1024 : window.innerWidth,
  );
  const [zoneHintLabel, setZoneHintLabel] = useState<string | null>(null);
  const waveformDragRef = useRef<{ pointerId: number; startX: number; startEndTs: number; width: number } | null>(null);
  const waveformTouchPointsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const waveformPinchRef = useRef<{ startDistance: number; startDuration: number } | null>(null);
  const zoneHintShowTimerRef = useRef<number | null>(null);
  const zoneHintHideTimerRef = useRef<number | null>(null);

  const currentBpm = hrSamples.length > 0 ? hrSamples[hrSamples.length - 1].bpm : null;
  const hrRollingAvg = useMemo(() => {
    if (hrSamples.length === 0) return null;
    const recent = hrSamples.slice(-30).map((item) => item.bpm);
    const avg = recent.reduce((sum, bpm) => sum + bpm, 0) / recent.length;
    return Math.round(avg);
  }, [hrSamples]);
  const hrSessionMin = useMemo(() => {
    if (hrSamples.length === 0) return null;
    return Math.min(...hrSamples.map((item) => item.bpm));
  }, [hrSamples]);
  const hrSessionMax = useMemo(() => {
    if (hrSamples.length === 0) return null;
    return Math.max(...hrSamples.map((item) => item.bpm));
  }, [hrSamples]);
  const hrIntensityPercent = useMemo(() => {
    if (!currentBpm) return 0;
    const min = 50;
    const max = 190;
    const clamped = Math.min(max, Math.max(min, currentBpm));
    return ((clamped - min) / (max - min)) * 100;
  }, [currentBpm]);
  const hrTrend = useMemo(() => {
    if (hrSamples.length < 8) return null;
    const recent = hrSamples.slice(-8).map((item) => item.bpm);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const delta = last - first;
    if (Math.abs(delta) < 2) return 'Stable';
    return delta > 0 ? 'Rising' : 'Falling';
  }, [hrSamples]);

  const hrZone = useMemo(() => {
    if (!currentBpm) return { label: 'Waiting', color: '#9AA4B2' };
    if (currentBpm < 95) return { label: 'Recovery', color: '#5DCAA5' };
    if (currentBpm < 125) return { label: 'Easy', color: 'var(--accent)' };
    if (currentBpm < 155) return { label: 'Moderate', color: '#FFCC00' };
    if (currentBpm < 175) return { label: 'Hard', color: '#FF9F1C' };
    return { label: 'Peak', color: '#FF5A5F' };
  }, [currentBpm]);

  const isIOSBrowser = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return /iPhone|iPad|iPod/i.test(ua) || touchMac;
  }, []);

  const unsupportedBluetoothHint = useMemo(() => {
    if (supportsWebBluetooth) return null;
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return 'Live pairing requires HTTPS. Open Athlix™ on a secure URL.';
    }
    if (isIOSBrowser) {
      return 'iOS browsers currently limit Web Bluetooth pairing. Use Android Chrome or desktop Chrome/Edge for live connection.';
    }
    return 'This browser does not support Web Bluetooth. Use a compatible Chrome/Edge browser.';
  }, [isIOSBrowser, supportsWebBluetooth]);

  const bluetoothSupportHint = useMemo(() => {
    if (typeof navigator === 'undefined') return null;
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      return 'On Android, keep your wearable in heart-rate broadcast mode before tapping Connect device.';
    }
    return null;
  }, []);

  const currentZoneIndex = useMemo(() => (currentBpm ? getHeartRateZoneIndex(currentBpm) : -1), [currentBpm]);
  const zoneDistribution = useMemo(() => {
    const counts = HEART_RATE_ZONES.map(() => 0);
    hrSamples.forEach((sample) => {
      counts[getHeartRateZoneIndex(sample.bpm)] += 1;
    });
    const total = hrSamples.length || 1;
    return HEART_RATE_ZONES.map((zone, idx) => ({
      ...zone,
      count: counts[idx],
      percent: Math.round((counts[idx] / total) * 100),
    }));
  }, [hrSamples]);

  const useCompactZoneLabels = viewportWidth < 640;
  const activeWaveColor = useMemo(() => {
    if (selectedZoneFilter === null) return '#59D9C6';
    return HEART_RATE_ZONES[selectedZoneFilter]?.color || '#59D9C6';
  }, [selectedZoneFilter]);
  const activeWaveDataKey = selectedZoneFilter === null ? 'bpm' : `z${selectedZoneFilter}`;
  const activeWaveAreaTop = useMemo(() => withAlpha(activeWaveColor, 0.36), [activeWaveColor]);
  const activeWaveAreaMid = useMemo(() => withAlpha(activeWaveColor, 0.2), [activeWaveColor]);
  const activeWaveAreaBottom = useMemo(() => withAlpha(activeWaveColor, 0), [activeWaveColor]);
  const activeWaveStroke = useMemo(() => withAlpha(activeWaveColor, 0.96), [activeWaveColor]);
  const activeWaveGlow = useMemo(() => withAlpha(activeWaveColor, 0.18), [activeWaveColor]);

  const heroWavePoints = useMemo(() => {
    const recent = hrSamples.slice(-48).map((sample) => sample.bpm);
    if (recent.length < 6) {
      const fallback = [16, 15.2, 16.4, 15.6, 16.9, 15.5, 16.3, 15.8, 16];
      return fallback
        .map((y, idx) => `${((idx / (fallback.length - 1)) * 100).toFixed(2)},${y.toFixed(2)}`)
        .join(' ');
    }
    const residuals = recent.map((value, idx) => {
      const start = Math.max(0, idx - 2);
      const end = Math.min(recent.length - 1, idx + 2);
      let sum = 0;
      for (let i = start; i <= end; i++) { sum += recent[i]; }
      const localMean = sum / (end - start + 1);
      return value - localMean;
    });
    const smoothed = residuals.map((value, idx) => {
      const start = Math.max(0, idx - 1);
      const end = Math.min(residuals.length - 1, idx + 1);
      let sum = 0;
      for (let i = start; i <= end; i++) { sum += residuals[i]; }
      return sum / (end - start + 1);
    });
    const rms = Math.sqrt(smoothed.reduce((sum, value) => sum + value * value, 0) / smoothed.length);
    const scale = rms > 0.001 ? 2.35 / rms : 0;
    return smoothed
      .map((value, idx) => {
        const x = (idx / (smoothed.length - 1)) * 100;
        const centered = Math.max(-2.9, Math.min(2.9, value * scale));
        const y = 16 - centered;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [hrSamples]);

  const allHeartRateSamples = useMemo(
    () => mergeHeartRateSamples(storedHeartRateSamples, hrSamples),
    [storedHeartRateSamples, hrSamples],
  );
  const latestHeartRateTs = useMemo(
    () => allHeartRateSamples[allHeartRateSamples.length - 1]?.ts ?? Date.now(),
    [allHeartRateSamples],
  );
  const isLineHeartRateView = heartRateView === 'live' || heartRateView === 'day';
  const lineScopeStartTs = useMemo(() => {
    if (heartRateView === 'day') return startOfToday().getTime();
    return latestHeartRateTs - LIVE_WAVEFORM_RANGE_MS;
  }, [heartRateView, latestHeartRateTs]);
  const lineScopeEndTs = useMemo(() => {
    if (heartRateView === 'day') return Date.now();
    return latestHeartRateTs;
  }, [heartRateView, latestHeartRateTs]);
  const maxWaveformDurationMs = heartRateView === 'day' ? DAY_WAVEFORM_RANGE_MS : LIVE_WAVEFORM_RANGE_MS;
  const waveformScopeSpanMs = Math.max(1, lineScopeEndTs - lineScopeStartTs);
  const maxAllowedWaveformDurationMs = Math.min(waveformScopeSpanMs, maxWaveformDurationMs);
  const minAllowedWaveformDurationMs = Math.min(MIN_WAVEFORM_WINDOW_MS, maxAllowedWaveformDurationMs);
  const effectiveWaveformDurationMs = Math.min(
    maxAllowedWaveformDurationMs,
    Math.max(minAllowedWaveformDurationMs, waveformWindowDurationMs),
  );
  const waveformVisibleEndTs = useMemo(() => {
    if (!isLineHeartRateView) return lineScopeEndTs;
    if (heartRateView === 'live' && waveformAtLive) return lineScopeEndTs;
    const fallbackEnd = waveformViewportEndTs ?? lineScopeEndTs;
    return Math.min(lineScopeEndTs, Math.max(lineScopeStartTs + effectiveWaveformDurationMs, fallbackEnd));
  }, [effectiveWaveformDurationMs, heartRateView, isLineHeartRateView, lineScopeEndTs, lineScopeStartTs, waveformAtLive, waveformViewportEndTs]);
  const waveformVisibleStartTs = Math.max(lineScopeStartTs, waveformVisibleEndTs - effectiveWaveformDurationMs);
  const visibleHeartRateSamples = useMemo(
    () => allHeartRateSamples.filter((sample) => sample.ts >= waveformVisibleStartTs && sample.ts <= waveformVisibleEndTs),
    [allHeartRateSamples, waveformVisibleEndTs, waveformVisibleStartTs],
  );
  const waveformVisibleData = useMemo(
    () => isLineHeartRateView
      ? buildHeartRateChartRows(visibleHeartRateSamples, waveformVisibleStartTs, waveformVisibleEndTs, MAX_WAVEFORM_CHART_POINTS)
      : [],
    [isLineHeartRateView, visibleHeartRateSamples, waveformVisibleEndTs, waveformVisibleStartTs],
  );
  const waveformVisibleActualData = useMemo(
    () => waveformVisibleData.filter((item) => typeof item.bpm === 'number'),
    [waveformVisibleData],
  );
  const waveformHasGapSegments = useMemo(() => waveformVisibleData.some((item) => item.isGap), [waveformVisibleData]);

  const weekHeartRateData = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd }).map((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = addDays(startOfDay(day), 1).getTime();
      const samples = allHeartRateSamples.filter((s) => s.ts >= dayStart && s.ts < dayEnd);
      const avgBpm = averageHeartRateSamples(samples);
      return {
        label: format(day, 'EEE'),
        longLabel: format(day, 'EEE, MMM d'),
        avgBpm,
        sampleCount: samples.length,
        color: getHeartRateZoneColor(avgBpm),
      };
    });
  }, [allHeartRateSamples]);

  const monthHeartRateData = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    return eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 }).map(
      (weekStart, index, allWeeks) => {
        const weekEnd = index === allWeeks.length - 1 ? addDays(monthEnd, 1) : allWeeks[index + 1];
        const startTs = weekStart.getTime();
        const endTs = weekEnd.getTime();
        const samples = allHeartRateSamples.filter((s) => s.ts >= startTs && s.ts < endTs);
        const avgBpm = averageHeartRateSamples(samples);
        return {
          label: `W${index + 1}`,
          longLabel: `${format(weekStart, 'MMM d')} - ${format(addDays(new Date(endTs), -1), 'MMM d')}`,
          avgBpm,
          sampleCount: samples.length,
          color: getHeartRateZoneColor(avgBpm),
        };
      },
    );
  }, [allHeartRateSamples]);

  const periodHeartRateBars = heartRateView === 'month' ? monthHeartRateData : weekHeartRateData;
  const hasPeriodBarData = periodHeartRateBars.some((item) => item.avgBpm !== null);

  useEffect(() => {
    if (!user) { setStoredHeartRateSamples([]); return; }
    let cancelled = false;
    const load = async () => {
      const sinceTs = Date.now() - HEART_RATE_HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
      const rows = await getHeartRateSamples(user.id, { sinceTs });
      if (cancelled) return;
      setStoredHeartRateSamples(rows.map((s) => ({ ts: s.ts, bpm: s.bpm })));
    };
    void load();
    const id = window.setInterval(() => void load(), hrConnected ? 15000 : 45000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [hrConnected, user]);

  useEffect(() => {
    if (heartRateView === 'live') {
      setWaveformWindowDurationMs(DEFAULT_LIVE_WAVEFORM_WINDOW_MS);
      setWaveformViewportEndTs(null);
      setWaveformAtLive(true);
      return;
    }
    if (heartRateView === 'day') {
      setWaveformWindowDurationMs(DAY_WAVEFORM_RANGE_MS);
      setWaveformViewportEndTs(Date.now());
      setWaveformAtLive(false);
    }
  }, [heartRateView]);

  const updateWaveformViewport = useCallback(
    (nextEndTs: number, nextDurationMs?: number) => {
      if (!isLineHeartRateView) return;
      const scopeSpan = Math.max(1, lineScopeEndTs - lineScopeStartTs);
      const maxDuration = Math.min(scopeSpan, maxWaveformDurationMs);
      const minDuration = Math.min(MIN_WAVEFORM_WINDOW_MS, maxDuration);
      const clampedDuration = Math.min(maxDuration, Math.max(minDuration, nextDurationMs ?? effectiveWaveformDurationMs));
      const clampedEnd = Math.min(lineScopeEndTs, Math.max(lineScopeStartTs + clampedDuration, nextEndTs));
      setWaveformWindowDurationMs(clampedDuration);
      setWaveformViewportEndTs(clampedEnd);
      setWaveformAtLive(heartRateView === 'live' && clampedEnd >= lineScopeEndTs - 1000);
    },
    [effectiveWaveformDurationMs, heartRateView, isLineHeartRateView, lineScopeEndTs, lineScopeStartTs, maxWaveformDurationMs],
  );

  const jumpWaveformLive = useCallback(() => {
    setHeartRateView('live');
    setWaveformWindowDurationMs(DEFAULT_LIVE_WAVEFORM_WINDOW_MS);
    setWaveformViewportEndTs(lineScopeEndTs);
    setWaveformAtLive(true);
  }, [lineScopeEndTs]);

  const handleWaveformWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!isLineHeartRateView) return;
      const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(dominantDelta) < 2) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const zoomRatio = dominantDelta > 0 ? 1.14 : 0.86;
        updateWaveformViewport(waveformVisibleEndTs, effectiveWaveformDurationMs * zoomRatio);
        return;
      }
      const panMs = (effectiveWaveformDurationMs * dominantDelta) / 360;
      updateWaveformViewport(waveformVisibleEndTs + panMs);
    },
    [effectiveWaveformDurationMs, isLineHeartRateView, updateWaveformViewport, waveformVisibleEndTs],
  );

  const handleWaveformPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isLineHeartRateView) return;
      const container = event.currentTarget;
      container.setPointerCapture(event.pointerId);
      if (event.pointerType === 'touch') {
        waveformTouchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (waveformTouchPointsRef.current.size >= 2) {
          const [first, second] = Array.from(waveformTouchPointsRef.current.values()) as Array<{ x: number; y: number }>;
          if (!first || !second) return;
          waveformPinchRef.current = { startDistance: Math.hypot(first.x - second.x, first.y - second.y), startDuration: effectiveWaveformDurationMs };
          waveformDragRef.current = null;
          return;
        }
      }
      const rect = container.getBoundingClientRect();
      waveformDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startEndTs: waveformVisibleEndTs, width: rect.width || 1 };
    },
    [effectiveWaveformDurationMs, isLineHeartRateView, waveformVisibleEndTs],
  );

  const handleWaveformPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'touch' && waveformTouchPointsRef.current.has(event.pointerId)) {
        waveformTouchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (waveformPinchRef.current && waveformTouchPointsRef.current.size >= 2) {
        const [first, second] = Array.from(waveformTouchPointsRef.current.values()) as Array<{ x: number; y: number }>;
        if (!first || !second) return;
        const nextDistance = Math.hypot(first.x - second.x, first.y - second.y);
        if (nextDistance > 0) {
          updateWaveformViewport(waveformVisibleEndTs, waveformPinchRef.current.startDuration * (waveformPinchRef.current.startDistance / nextDistance));
        }
        return;
      }
      const dragState = waveformDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const deltaRatio = (dragState.startX - event.clientX) / Math.max(1, dragState.width);
      updateWaveformViewport(dragState.startEndTs + effectiveWaveformDurationMs * deltaRatio);
    },
    [effectiveWaveformDurationMs, updateWaveformViewport, waveformVisibleEndTs],
  );

  const clearWaveformDrag = useCallback((pointerId?: number) => {
    if (pointerId !== undefined) waveformTouchPointsRef.current.delete(pointerId);
    if (waveformTouchPointsRef.current.size < 2) waveformPinchRef.current = null;
    if (!waveformDragRef.current) return;
    if (pointerId !== undefined && waveformDragRef.current.pointerId !== pointerId) return;
    waveformDragRef.current = null;
  }, []);

  const clearZoneHintTimers = useCallback(() => {
    if (zoneHintShowTimerRef.current) { window.clearTimeout(zoneHintShowTimerRef.current); zoneHintShowTimerRef.current = null; }
    if (zoneHintHideTimerRef.current) { window.clearTimeout(zoneHintHideTimerRef.current); zoneHintHideTimerRef.current = null; }
  }, []);

  const handleZoneHintStart = useCallback((label: string) => {
    clearZoneHintTimers();
    zoneHintShowTimerRef.current = window.setTimeout(() => setZoneHintLabel(label), 420);
  }, [clearZoneHintTimers]);

  const handleZoneHintEnd = useCallback(() => {
    if (zoneHintShowTimerRef.current) { window.clearTimeout(zoneHintShowTimerRef.current); zoneHintShowTimerRef.current = null; }
    zoneHintHideTimerRef.current = window.setTimeout(() => { setZoneHintLabel(null); zoneHintHideTimerRef.current = null; }, 650);
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => () => clearZoneHintTimers(), [clearZoneHintTimers]);
  useEffect(() => { if (user) fetchData(); }, [user, displayUnit]);

  useEffect(() => {
    if (!user || activeTab !== 'food') return;
    let cancelled = false;
    const load = async () => {
      setFoodLoading(true);
      try {
        const [cals, { scans }] = await Promise.all([
          getTodayCalories(user.id),
          getFoodScans(user.id, 0, 4),
        ]);
        if (cancelled) return;
        setTodayCalories(cals);
        setRecentScans(scans);
      } catch { /* silent */ } finally {
        if (!cancelled) setFoodLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user, activeTab]);

  useEffect(() => {
    if (heightCm && weightLogs.length > 0) {
      const currentWeight = weightLogs[weightLogs.length - 1].weight;
      const heightM = parseFloat(heightCm) / 100;
      if (heightM > 0) {
        const weightKg = displayUnit === 'lbs' ? currentWeight / 2.20462 : currentWeight;
        setBmiValue((weightKg / (heightM * heightM)).toFixed(1));
      } else setBmiValue(null);
    } else setBmiValue(null);
  }, [heightCm, weightLogs, displayUnit]);

  // Pre-fill weight input with most recent log so user can just nudge +/-
  useEffect(() => {
    if (weightLogs.length > 0) {
      setNewWeight(weightLogs[weightLogs.length - 1].weight.toFixed(1));
    }
  }, [weightLogs]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    startProgress();
    try {
      if (!user) { setWeightLogs([]); setWorkouts([]); setExercises([]); return; }
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const [weightData, workoutData, exerciseData] = await Promise.all([
        getBodyWeightLogs(user.id),
        getWorkouts(user.id, { startDate: thirtyDaysAgo }),
        getExerciseRowsWithWorkoutDates(user.id),
      ]);
      const targetUnit = displayUnit as WeightUnit;
      setWeightLogs(
        (weightData || [])
          .map((log: any) => ({
            ...log,
            weight: convertWeight(Number(log.weight || 0), (log.unit || targetUnit) as WeightUnit, targetUnit, 0.1),
            unit: targetUnit,
          }))
          .sort((a: any, b: any) => (a.date > b.date ? 1 : -1)),
      );
      setWorkouts(workoutData || []);
      if (exerciseData) {
        setExercises(exerciseData.map((exercise: any) => ({
          ...exercise,
          weight: !exercise.unit || isWeightUnit(exercise.unit)
            ? convertWeight(Number(exercise.weight || 0), isWeightUnit(exercise.unit) ? exercise.unit : targetUnit, targetUnit, 0.1)
            : Number(exercise.weight || 0),
          unit: !exercise.unit || isWeightUnit(exercise.unit) ? targetUnit : exercise.unit,
        })));
        // exercise names available for future use
      }
    } catch (error) {
      console.error('Error fetching progress data:', error);
    } finally {
      doneProgress();
      setLoading(false);
    }
  }, [user, displayUnit, startProgress, doneProgress]);

  const handleLogWeight = async () => {
    if (!newWeight || !user) return;
    const weightNum = parseFloat(newWeight);
    if (isNaN(weightNum)) return;
    try {
      await logBodyWeight(user.id, { date: weightDate, weight: weightNum, unit: displayUnit, notes: null });
      setNewWeight('');
      setWeightDate(format(new Date(), 'yyyy-MM-dd'));
      toast.success('Weight logged');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to log weight');
    }
  };

  const handleEditWeight = async () => {
    if (!editEntry || !editWeight || !user) return;
    const weightNum = parseFloat(editWeight);
    if (isNaN(weightNum)) return;
    try {
      await updateBodyWeightLog(user.id, editEntry.id, { weight: weightNum, unit: displayUnit, notes: editEntry.notes });
      setEditEntry(null);
      setEditWeight('');
      toast.success('Entry updated');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update entry');
    }
  };

  const last30Days = Array.from({ length: 30 }, (_, i) => format(subDays(new Date(), 29 - i), 'yyyy-MM-dd'));
  const heatmapData = last30Days.map(dateStr => {
    const dayWorkouts = workouts.filter(w => w.date === dateStr);
    const totalMinutes = dayWorkouts.reduce((acc, workout) => acc + Number(workout.duration_minutes || 0), 0);
    return {
      date: dateStr,
      count: dayWorkouts.length,
      minutes: totalMinutes,
      intensity: dayWorkouts.length > 0 ? Math.min(dayWorkouts.length, 4) : 0,
    };
  });
  const activeDaysInLast30 = heatmapData.filter((day) => day.count > 0).length;
  const totalMinutesInLast30 = heatmapData.reduce((sum, day) => sum + day.minutes, 0);
  const averageSessionsPerWeek = workouts.length / (30 / 7);
  const last30StartLabel = format(subDays(new Date(), 29), 'MMM d');
  const last30EndLabel = format(new Date(), 'MMM d');

  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 0;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const sortedWorkouts = [...workouts].sort((a, b) => (parseDateAtStartOfDay(b.date)?.getTime() ?? 0) - (parseDateAtStartOfDay(a.date)?.getTime() ?? 0));
  const workoutDates = Array.from(new Set(sortedWorkouts.map(w => w.date)));
  if (workoutDates.includes(todayStr) || workoutDates.includes(yesterdayStr)) {
    let checkDate = workoutDates.includes(todayStr) ? new Date() : subDays(new Date(), 1);
    while (workoutDates.includes(format(checkDate, 'yyyy-MM-dd'))) { currentStreak++; checkDate = subDays(checkDate, 1); }
  }
  heatmapData.forEach(day => {
    if (day.count > 0) { tempStreak++; if (tempStreak > maxStreak) maxStreak = tempStreak; } else tempStreak = 0;
  });

  const currentMonthStart = volumeMonth;
  const currentMonthEnd = endOfMonth(volumeMonth);
  const previousMonthStart = startOfMonth(subMonths(volumeMonth, 1));
  const previousMonthEnd = endOfMonth(subMonths(volumeMonth, 1));
  // Exercises already carry their own workout date (and, with the fix in
  // Task 1, their parent workout's muscle_groups fallback) — filtering
  // exercises directly instead of cross-referencing the 30-day-capped
  // `workouts` array means Monthly Volume works for ANY past month.
  const currentMonthExercises = exercises.filter((ex) => {
    const d = parseDateAtStartOfDay(ex.workouts?.date);
    return Boolean(d && d >= currentMonthStart && d <= currentMonthEnd);
  });
  const previousMonthExercises = exercises.filter((ex) => {
    const d = parseDateAtStartOfDay(ex.workouts?.date);
    return Boolean(d && d >= previousMonthStart && d <= previousMonthEnd);
  });

  const calculateMuscleVolume = (exerciseList: any[]) => {
    const volumeMap: Record<string, number> = {};
    exerciseList.forEach((ex) => {
      const vol = ex.sets * ex.reps * ex.weight;
      if (ex.muscle_group) volumeMap[ex.muscle_group] = (volumeMap[ex.muscle_group] || 0) + vol;
      else if (Array.isArray(ex.workout_muscle_groups) && ex.workout_muscle_groups.length > 0) {
        const volPerMuscle = vol / ex.workout_muscle_groups.length;
        ex.workout_muscle_groups.forEach((m: string) => { volumeMap[m] = (volumeMap[m] || 0) + volPerMuscle; });
      }
    });
    return volumeMap;
  };

  const currentMonthVolume = calculateMuscleVolume(currentMonthExercises);
  const previousMonthVolume = calculateMuscleVolume(previousMonthExercises);
  const allMuscles = Array.from(new Set([...Object.keys(currentMonthVolume), ...Object.keys(previousMonthVolume)]));
  const totalVolume = Object.values(currentMonthVolume).reduce((a, b) => a + b, 0);
  let balanceScore = 100;
  if (totalVolume > 0 && allMuscles.length > 0) {
    const idealVolumePerMuscle = totalVolume / allMuscles.length;
    const deviations = allMuscles.map(m => Math.abs((currentMonthVolume[m] || 0) - idealVolumePerMuscle));
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / allMuscles.length;
    balanceScore = Math.max(0, 100 - (avgDeviation / idealVolumePerMuscle) * 100);
  }

  const setsByMuscleWeek = useMemo(() => {
    const result: Record<string, number[]> = {};
    const months = Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(volumeMonth, 5 - i);
      return { start: startOfMonth(m), end: endOfMonth(m) };
    });
    exercises.forEach((ex) => {
      const date = parseDateAtStartOfDay(ex.workouts?.date);
      if (!date) return;
      const mg = ex.muscle_group;
      if (!mg) return;
      const mi = months.findIndex((m) => date >= m.start && date <= m.end);
      if (mi === -1) return;
      if (!result[mg]) result[mg] = new Array(6).fill(0);
      result[mg][mi] += ex.sets || 0;
    });
    return result;
  }, [exercises, volumeMonth]);

  const setVolumeData = useMemo(() => {
    const computeSets = (exList: any[]) => {
      const map: Record<string, number> = {};
      exList.forEach((ex) => {
        const mg = ex.muscle_group;
        if (mg) map[mg] = (map[mg] || 0) + (ex.sets || 0);
      });
      return map;
    };
    const cur = computeSets(currentMonthExercises);
    const prev = computeSets(previousMonthExercises);
    const muscles = Array.from(new Set([...Object.keys(cur), ...Object.keys(prev)]));
    return muscles.map((m) => ({ muscle: m, current: cur[m] || 0, previous: prev[m] || 0 })).sort((a, b) => b.current - a.current);
  }, [currentMonthExercises, previousMonthExercises]);

  if (loading && exercises.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse bg-white/5 rounded-xl h-16" />
          ))}
        </div>
        <div className="animate-pulse bg-white/5 rounded-xl h-40" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="animate-pulse bg-white/5 rounded-xl h-24" />
          ))}
        </div>
      </div>
    );
  }

  /* ── Tab config ─────────────────────────────── */
  const TABS = [
    { id: 'overview',  label: 'Overview',   Icon: Activity  },
    { id: 'food',      label: 'Nutrition',  Icon: Utensils  },
    { id: 'dopamine',  label: 'Dopamine',   Icon: Target    },
    { id: 'goals',     label: 'Goals',      Icon: Trophy    },
    { id: 'weight',    label: 'Weight',     Icon: Scale     },
  ] as const;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] pb-28 md:pb-10">
      {/* ── Sticky Tab Nav ─────────────────────────────────── */}
      <div className="sticky top-0 z-20" style={{ background: 'var(--bg-base)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--bg-elevated)] border border-white/8 relative">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.04em] uppercase transition-all duration-200 ${
                    isActive
                      ? 'bg-[var(--accent)] text-black shadow-[0_4px_14px_rgba(200,255,0,0.35)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/5'
                  }`}
                >
                  <tab.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="hidden sm:block">{tab.label}</span>
                </button>
              );
            })}

            {/* Divider + HR heart button spacer */}
            <div className="w-px h-6 bg-white/10 flex-shrink-0" />

            <button
              onClick={() => setActiveTab('livehr')}
              className={`relative flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                activeTab === 'livehr'
                  ? 'bg-[var(--heart-rate)] text-black shadow-[0_4px_14px_rgba(25,204,240,0.40)]'
                  : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5'
              }`}
              title="Live Heart Rate"
            >
              {hrConnected && (
                <motion.span
                  className="absolute inset-0 rounded-xl border border-[var(--heart-rate)]/50"
                  animate={{ scale: [1, 1.18], opacity: [0.6, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
              )}
              <Heart className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="space-y-5"
        >

          {/* ════════════════════════════════════════════════
              OVERVIEW
          ════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
            <>
              {/* Heatmap card */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5 overflow-hidden">
                {/* Header */}
                <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Workout Frequency</p>
                    <p className="text-[14px] font-semibold text-[var(--text-secondary)]">Last 30 days</p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">{last30StartLabel} to {last30EndLabel}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-right">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Sessions</p>
                      <p className="mt-1 text-[18px] font-black leading-none text-white tabular-nums">{workouts.length}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-right">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Active days</p>
                      <p className="mt-1 text-[18px] font-black leading-none text-white tabular-nums">{activeDaysInLast30}<span className="ml-0.5 text-[12px] font-semibold text-[var(--text-muted)]">/30</span></p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-right">
                      <div className="mb-0.5 flex items-center justify-end gap-1">
                        <Flame className="h-3 w-3 text-[var(--accent)]" />
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Streak</p>
                      </div>
                      <p className="text-[18px] font-black leading-none text-[var(--accent)] tabular-nums">{currentStreak}<span className="ml-0.5 text-[12px] font-bold">d</span></p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-right">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Best</p>
                      <p className="mt-1 text-[18px] font-black leading-none text-[var(--text-primary)] tabular-nums">{maxStreak}<span className="ml-0.5 text-[12px] font-bold">d</span></p>
                    </div>
                  </div>
                </div>

                {/* Heat tiles */}
                <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                  <div className="overflow-x-auto pb-1">
                    <div className="flex min-w-[660px] items-center gap-1.5 pr-2">
                      {heatmapData.map((day, idx) => {
                        const alpha =
                          day.intensity === 0 ? 0.06 :
                          day.intensity === 1 ? 0.32 :
                          day.intensity === 2 ? 0.52 :
                          day.intensity === 3 ? 0.74 : 1;
                        const isToday = day.date === todayStr;
                        return (
                          <React.Fragment key={day.date}>
                            {idx > 0 && idx % 7 === 0 && <span className="h-5 w-px bg-white/12" />}
                            <div
                              title={`${formatStoredDate(day.date, 'EEE, MMM d')}: ${day.count} workout${day.count !== 1 ? 's' : ''}${day.minutes > 0 ? ` • ${day.minutes} min` : ''}`}
                              className="h-5 w-5 rounded-[4px] border transition-all duration-150 hover:-translate-y-0.5"
                              style={{
                                borderColor: isToday ? 'rgba(200,255,0,0.95)' : 'rgba(255,255,255,0.06)',
                                background: day.intensity === 0
                                  ? 'rgba(255,255,255,0.07)'
                                  : `rgba(200,255,0,${alpha})`,
                                boxShadow: isToday ? '0 0 0 1px rgba(200,255,0,0.35)' : 'none',
                              }}
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <span>{last30StartLabel}</span>
                    <span className="font-semibold tracking-[0.08em] text-[var(--text-secondary)]">LAST 30 DAYS</span>
                    <span>{last30EndLabel}</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {averageSessionsPerWeek.toFixed(1)} sessions/week average · {Math.round(totalMinutesInLast30)} min tracked
                  </p>
                  <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-muted)]">Less</span>
                  {[0.06, 0.32, 0.52, 0.74, 1].map((a, i) => (
                    <div key={i} className="w-3 h-3 rounded-[3px]"
                      style={{ background: i === 0 ? 'rgba(255,255,255,0.06)' : `rgba(200,255,0,${a})` }}
                    />
                  ))}
                  <span className="text-[10px] text-[var(--text-muted)]">More</span>
                  </div>
                </div>
              </div>

              {/* Exercise History search */}
              {user && <ExerciseHistorySearch userId={user.id} exercises={exercises} weightUnit={displayUnit as WeightUnit} />}

              {/* Volume rows card */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1">Monthly Volume</p>
                    {setVolumeData.length > 0 && (
                      <p className="text-[26px] font-black text-white tabular-nums leading-none">
                        {setVolumeData.reduce((a, d) => a + d.current, 0)}
                        <span className="text-[13px] font-medium text-[var(--text-muted)] ml-1.5">sets</span>
                        {totalVolume > 0 && (
                          <span className="text-[13px] font-medium text-[var(--text-muted)] ml-2">
                            · {Math.round(totalVolume).toLocaleString()} {displayUnit}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {/* Month picker */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setVolumeMonth(m => startOfMonth(subMonths(m, 1)))}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-white hover:bg-white/8 transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[12px] font-semibold text-[var(--text-secondary)] tabular-nums min-w-[68px] text-center">
                        {format(volumeMonth, 'MMM yyyy')}
                      </span>
                      <button
                        onClick={() => setVolumeMonth(m => startOfMonth(addMonths(m, 1)))}
                        disabled={volumeMonth >= startOfMonth(new Date())}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-white hover:bg-white/8 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {balanceScore > 0 && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        balanceScore > 75
                          ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                          : balanceScore > 45
                          ? 'bg-[var(--yellow)]/10 text-[var(--yellow)]'
                          : 'bg-[var(--red)]/10 text-[var(--red)]'
                      }`}>
                        {balanceScore > 75 ? 'Balanced' : balanceScore > 45 ? 'Uneven' : 'Skewed'}
                      </span>
                    )}
                  </div>
                </div>

                {setVolumeData.length === 0 ? (
                  <div className="py-10 text-center">
                    <Activity className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)] opacity-30" />
                    <p className="text-[13px] text-[var(--text-muted)]">No workouts logged in {format(volumeMonth, 'MMMM')}.</p>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {setVolumeData.map((item) => {
                      const isActive = item.current > 0;
                      const maxSets = Math.max(...setVolumeData.filter(d => d.current > 0).map(d => d.current), 1);
                      const pct = item.current / maxSets;
                      const sparkData: number[] = setsByMuscleWeek[item.muscle] || new Array(6).fill(0);
                      const delta = item.current - item.previous;
                      const muscleVol = currentMonthVolume[item.muscle] || 0;

                      // Muscle color via CSS var
                      const MUSCLE_HEX_MAP: Record<string, string> = {
                        Chest: palette.chest, Back: palette.back, Legs: palette.legs,
                        Shoulders: palette.shoulders, Core: palette.core, Biceps: palette.biceps,
                        Triceps: palette.triceps, Arms: palette.biceps, Cardio: palette.cardio,
                        Glutes: '#F4B96A', Forearms: '#98D4E8', Mobility: '#85C9B0', Yoga: '#7CB9C8',
                      };
                      const color = MUSCLE_HEX_MAP[item.muscle] ?? palette.accent;

                      // Sparkline
                      const sw = 72, sh = 24;
                      const sMax = Math.max(...sparkData, 1);
                      const sx = (i: number) => (i / Math.max(sparkData.length - 1, 1)) * sw;
                      const sy = (v: number) => sh - (v / sMax) * (sh - 3) - 1;
                      const sparkPath = sparkData.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
                      const areaPath = `${sparkPath} L ${sw} ${sh} L 0 ${sh} Z`;

                      // Trend indicator
                      const trendIcon = delta > 2 ? '↑' : delta < -2 ? '↓' : '→';
                      const trendColor = delta > 2 ? palette.green : delta < -2 ? palette.red : 'var(--text-muted)';

                      return (
                        <div
                          key={item.muscle}
                          className="py-3 border-b border-white/5 last:border-0"
                          style={{ opacity: isActive ? 1 : 0.38 }}
                        >
                          {/* Row top: name + load + trend */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                              <span className="text-[13px] font-semibold text-white truncate">{item.muscle}</span>
                              {muscleVol > 0 && (
                                <span className="text-[11px] tabular-nums" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                  {Math.round(muscleVol).toLocaleString()} {displayUnit}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {/* Sparkline */}
                              <svg viewBox={`0 0 ${sw} ${sh}`} width={sw} height={sh} style={{ display: 'block' }}>
                                <defs>
                                  <linearGradient id={`sg-${item.muscle}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={color} stopOpacity={isActive ? 0.25 : 0.08} />
                                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                                  </linearGradient>
                                </defs>
                                <path d={areaPath} fill={`url(#sg-${item.muscle})`} />
                                <path d={sparkPath} fill="none" stroke={isActive ? color : 'rgba(255,255,255,0.18)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                {isActive && (
                                  <circle cx={sx(sparkData.length - 1).toFixed(1)} cy={sy(sparkData[sparkData.length - 1]).toFixed(1)} r="2.5" fill={color} />
                                )}
                              </svg>
                              {/* Trend */}
                              <span className="text-[13px] font-bold w-5 text-right" style={{ color: trendColor }}>{trendIcon}</span>
                            </div>
                          </div>

                          {/* Progress bar + set count */}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct * 100}%`, background: isActive ? color : 'rgba(255,255,255,0.15)' }}
                              />
                            </div>
                            <span className="text-[11px] font-bold tabular-nums w-14 text-right" style={{ color: isActive ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)' }}>
                              {item.current} sets
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════
              NUTRITION
          ════════════════════════════════════════════════ */}
          {activeTab === 'food' && (
            <>
              {/* Today's calories card */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Today's Nutrition</p>

                <div className="flex items-center gap-5 mb-5">
                  {/* Calorie ring */}
                  <div className="relative flex-shrink-0">
                    <svg width={88} height={88} viewBox="0 0 88 88">
                      <circle cx={44} cy={44} r={38} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
                      <circle
                        cx={44} cy={44} r={38}
                        fill="none" stroke="#C8FF00" strokeWidth={7}
                        strokeLinecap="round"
                        strokeDasharray={`${Math.min(todayCalories / 2000, 1) * 238.76} 238.76`}
                        transform="rotate(-90 44 44)"
                        style={{ transition: 'stroke-dasharray 0.6s ease' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[20px] font-black leading-none tabular-nums" style={{ color: '#C8FF00' }}>{todayCalories}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>kcal</span>
                    </div>
                  </div>

                  {/* Goal bar + macros */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>Daily goal</span>
                      <span className="text-[11px] font-bold tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>2000 kcal</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(todayCalories / 2000 * 100, 100)}%`, background: todayCalories > 2000 ? '#FF5A5F' : '#C8FF00' }}
                      />
                    </div>
                    {(() => {
                      const today = new Date().toDateString();
                      const todayScans = recentScans.filter(s => new Date(s.scan_date).toDateString() === today);
                      const mac = todayScans.reduce(
                        (acc, s) => ({ p: acc.p + s.total_protein, c: acc.c + s.total_carbs, f: acc.f + s.total_fat }),
                        { p: 0, c: 0, f: 0 },
                      );
                      return (
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            { label: 'Protein', value: mac.p, color: '#59D9C6' },
                            { label: 'Carbs',   value: mac.c, color: '#C8FF00' },
                            { label: 'Fat',     value: mac.f, color: '#FF9F1C' },
                          ] as const).map(m => (
                            <div key={m.label} className="rounded-xl px-2 py-2 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                              <p className="text-[15px] font-black tabular-nums leading-none" style={{ color: m.color }}>
                                {Math.round(m.value)}<span className="text-[9px] font-bold ml-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>g</span>
                              </p>
                              <p className="text-[9px] font-bold uppercase tracking-wider mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{m.label}</p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2.5">
                  <button
                    onClick={() => navigate('/food/scan')}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-[14px] font-bold text-black active:scale-[0.97] transition-all"
                    style={{ background: '#C8FF00', boxShadow: '0 4px 20px rgba(200,255,0,0.25)' }}
                  >
                    <Camera className="w-4 h-4" /> Scan Meal
                  </button>
                  <button
                    onClick={() => navigate('/food/history')}
                    className="flex items-center justify-center px-5 py-3.5 rounded-2xl active:scale-[0.97] transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}
                    title="View history"
                  >
                    <History className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Recent scans */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'rgba(255,255,255,0.3)' }}>Recent Scans</p>
                  <button onClick={() => navigate('/food/history')} className="text-[11px] font-bold" style={{ color: '#C8FF00' }}>View all</button>
                </div>

                {foodLoading ? (
                  <div>
                    {[0, 1, 2].map(i => (
                      <div key={i} className="flex items-center gap-3 px-5 py-4 border-t border-white/5">
                        <div className="w-12 h-12 rounded-xl animate-pulse flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 rounded animate-pulse w-2/3" style={{ background: 'rgba(255,255,255,0.06)' }} />
                          <div className="h-2.5 rounded animate-pulse w-1/3" style={{ background: 'rgba(255,255,255,0.04)' }} />
                        </div>
                        <div className="h-5 w-12 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
                      </div>
                    ))}
                  </div>
                ) : recentScans.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 px-5 text-center">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.15)' }}>
                      <Utensils className="w-6 h-6" style={{ color: 'rgba(200,255,0,0.6)' }} />
                    </div>
                    <p className="text-[14px] font-bold" style={{ color: '#fff' }}>No scans yet</p>
                    <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Scan your first meal to start tracking calories and macros.
                    </p>
                    <button
                      onClick={() => navigate('/food/scan')}
                      className="mt-1 flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[13px] font-bold text-black active:scale-95 transition-all"
                      style={{ background: '#C8FF00' }}
                    >
                      <Camera className="w-4 h-4" /> Scan your first meal
                    </button>
                  </div>
                ) : (
                  <div>
                    {recentScans.map((scan, idx) => {
                      const foods = (scan.foods_detected as any[]) ?? [];
                      const names = foods.map((f: any) => f.name).filter(Boolean).join(', ') || 'Unknown food';
                      const date = new Date(scan.scan_date);
                      const isToday = date.toDateString() === new Date().toDateString();
                      const dateLabel = isToday ? `Today ${format(date, 'h:mm a')}` : format(date, 'MMM d, h:mm a');
                      return (
                        <button
                          key={scan.id}
                          onClick={() => navigate('/food/history')}
                          className="w-full flex items-center gap-3 px-5 py-4 border-t border-white/5 text-left active:bg-white/5 transition-colors"
                          style={{ borderTopColor: idx === 0 ? 'rgba(255,255,255,0.05)' : undefined }}
                        >
                          {scan.thumbnail_url ? (
                            <img src={scan.thumbnail_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" style={{ border: '1px solid rgba(255,255,255,0.08)' }} />
                          ) : (
                            <div className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.12)' }}>
                              <Utensils className="w-5 h-5" style={{ color: 'rgba(200,255,0,0.4)' }} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold truncate" style={{ color: '#fff' }}>{names}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{dateLabel}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[16px] font-black tabular-nums leading-none" style={{ color: '#C8FF00' }}>{scan.total_calories}</p>
                            <p className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>kcal</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════
              PERSONAL RECORDS
          ════════════════════════════════════════════════ */}
          {activeTab === 'dopamine' && <DopamineTracker />}
          {activeTab === 'goals' && user && <GoalsSection userId={user.id} weightUnit={displayUnit as 'kg' | 'lbs'} />}

          {/* ════════════════════════════════════════════════
              WEIGHT
          ════════════════════════════════════════════════ */}
          {activeTab === 'weight' && (
            <>
              {/* Log weight */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Log Weight</p>

                {/* Date picker trigger */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarMonth(startOfMonth(parseISO(weightDate)));
                      setShowDatePicker((v) => !v);
                    }}
                    className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-left transition-colors focus:outline-none"
                    style={{ borderColor: showDatePicker ? 'var(--accent)' : undefined }}
                  >
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">
                      {format(parseISO(weightDate), 'MMMM d, yyyy')}
                    </span>
                    <CalendarDays className="h-4 w-4 text-[var(--text-muted)]" />
                  </button>

                  {/* Inline calendar dropdown */}
                  {showDatePicker && (() => {
                    const today = new Date();
                    const monthStart = startOfMonth(calendarMonth);
                    const monthEnd = endOfMonth(calendarMonth);
                    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
                    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
                    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
                    const selected = parseISO(weightDate);
                    return (
                      <div
                        className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 rounded-2xl p-4 shadow-2xl"
                        style={{ background: '#161a22', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {/* Month nav */}
                        <div className="flex items-center justify-between mb-3">
                          <button
                            type="button"
                            onClick={() => setCalendarMonth((m) => subMonths(m, 1))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <span className="text-[13px] font-black text-white tracking-[0.08em]">
                            {format(calendarMonth, 'MMMM yyyy')}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                            disabled={isSameMonth(calendarMonth, today)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 mb-1">
                          {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
                            <span key={d} className="text-center text-[9px] font-black uppercase tracking-[0.1em] text-white/25 py-1">{d}</span>
                          ))}
                        </div>

                        {/* Day grid */}
                        <div className="grid grid-cols-7 gap-y-0.5">
                          {days.map((day) => {
                            const inMonth = isSameMonth(day, calendarMonth);
                            const isToday = isSameDay(day, today);
                            const isSel = isSameDay(day, selected);
                            const isFuture = day > today;
                            return (
                              <button
                                key={day.toISOString()}
                                type="button"
                                disabled={isFuture || !inMonth}
                                onClick={() => {
                                  setWeightDate(format(day, 'yyyy-MM-dd'));
                                  setShowDatePicker(false);
                                }}
                                className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold transition-all
                                  ${!inMonth ? 'opacity-0 pointer-events-none' : ''}
                                  ${isFuture && inMonth ? 'opacity-20 cursor-not-allowed' : ''}
                                  ${isSel ? 'font-black text-black' : isToday ? 'text-[var(--accent)] font-black' : 'text-white/70 hover:bg-white/8 hover:text-white'}
                                `}
                                style={isSel ? { background: 'var(--accent)' } : isToday && !isSel ? { boxShadow: '0 0 0 1.5px var(--accent)' } : undefined}
                              >
                                {format(day, 'd')}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Weight input with steppers */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2 items-stretch">
                    {/* Input + unit badge */}
                    <div className="flex flex-1 flex-col items-center justify-center bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[var(--accent)] transition-colors min-w-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={newWeight}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) setNewWeight(val);
                        }}
                        onBlur={() => {
                          const n = parseFloat(newWeight);
                          if (!isNaN(n)) setNewWeight(parseFloat(n.toFixed(1)).toString());
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogWeight()}
                        placeholder={weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight.toFixed(1) : '75.0'}
                        className="w-full bg-transparent text-white text-[22px] font-black text-center focus:outline-none placeholder:text-white/25"
                      />
                      <span className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>{displayUnit}</span>
                    </div>

                    {/* ±0.1 tall pill */}
                    <div
                      className="flex flex-col items-center justify-between shrink-0 rounded-2xl py-2 px-1 gap-1"
                      style={{ width: 58, background: 'rgba(200,255,0,0.08)', border: '1.5px solid rgba(200,255,0,0.30)' }}
                    >
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.80, y: -2 }}
                        whileHover={{ scale: 1.06 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                        onClick={() => setNewWeight((v) => {
                          const cur = parseFloat(v) || 0;
                          return String(parseFloat((cur + 0.1).toFixed(1)));
                        })}
                        className="flex flex-col items-center gap-0.5 w-full py-1"
                        style={{ color: 'var(--accent)' }}
                      >
                        <ChevronUp className="w-5 h-5 stroke-[2.5]" />
                        <span className="text-[11px] font-black leading-none">+0.1</span>
                      </motion.button>
                      <div className="w-8 h-px" style={{ background: 'rgba(200,255,0,0.20)' }} />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.80, y: 2 }}
                        whileHover={{ scale: 1.06 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                        onClick={() => setNewWeight((v) => {
                          const cur = parseFloat(v) || 0;
                          const next = parseFloat((cur - 0.1).toFixed(1));
                          return String(Math.max(0, next));
                        })}
                        className="flex flex-col items-center gap-0.5 w-full py-1"
                        style={{ color: 'var(--accent)' }}
                      >
                        <span className="text-[11px] font-black leading-none">−0.1</span>
                        <ChevronDown className="w-5 h-5 stroke-[2.5]" />
                      </motion.button>
                    </div>

                    {/* ±1 tall pill */}
                    <div
                      className="flex flex-col items-center justify-between shrink-0 rounded-2xl py-2 px-1 gap-1"
                      style={{ width: 58, background: 'rgba(200,255,0,0.08)', border: '1.5px solid rgba(200,255,0,0.30)' }}
                    >
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.80, y: -2 }}
                        whileHover={{ scale: 1.06 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                        onClick={() => setNewWeight((v) => {
                          const cur = parseFloat(v) || 0;
                          return String(parseFloat((cur + 1).toFixed(1)));
                        })}
                        className="flex flex-col items-center gap-0.5 w-full py-1"
                        style={{ color: 'var(--accent)' }}
                      >
                        <ChevronUp className="w-5 h-5 stroke-[2.5]" />
                        <span className="text-[11px] font-black leading-none">+1</span>
                      </motion.button>
                      <div className="w-8 h-px" style={{ background: 'rgba(200,255,0,0.20)' }} />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.80, y: 2 }}
                        whileHover={{ scale: 1.06 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                        onClick={() => setNewWeight((v) => {
                          const cur = parseFloat(v) || 0;
                          const next = parseFloat((cur - 1).toFixed(1));
                          return String(Math.max(0, next));
                        })}
                        className="flex flex-col items-center gap-0.5 w-full py-1"
                        style={{ color: 'var(--accent)' }}
                      >
                        <span className="text-[11px] font-black leading-none">−1</span>
                        <ChevronDown className="w-5 h-5 stroke-[2.5]" />
                      </motion.button>
                    </div>
                  </div>

                  <button
                    onClick={handleLogWeight}
                    disabled={!newWeight || parseFloat(newWeight) <= 0}
                    className="w-full bg-[var(--accent)] text-black py-3 rounded-xl font-bold text-[14px] hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Save Weight
                  </button>
                </div>

                {/* Unit caution */}
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.14)' }}
                >
                  <Info className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                  <p className="text-[11px] font-semibold leading-snug" style={{ color: 'rgba(200,255,0,0.75)' }}>
                    Your unit is set to <span className="font-black">{displayUnit.toUpperCase()}</span> in Settings — make sure you enter weight in {displayUnit === 'lbs' ? 'pounds' : 'kilograms'}.
                  </p>
                </div>
              </div>

              {/* Stats row */}
              {weightLogs.length > 0 && (() => {
                const weights = weightLogs.map(l => l.weight);
                const current = weights[weights.length - 1];
                const lowest = Math.min(...weights);
                const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
                const change = weights.length > 1 ? current - weights[0] : null;
                return (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Current', value: current, accent: true },
                        { label: 'Start', value: weights[0], accent: false },
                        { label: 'Lowest', value: lowest, accent: false },
                        { label: 'Avg', value: avg, accent: false },
                      ].map(({ label, value, accent }) => (
                        <div key={label} className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-4 text-center">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)] mb-2">{label}</p>
                          <p className={`text-[20px] font-black tabular-nums leading-none ${accent ? 'text-[var(--accent)]' : 'text-white'}`}>{value.toFixed(1)}</p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">{displayUnit}</p>
                        </div>
                      ))}
                    </div>
                    {change !== null && (
                      <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-4 flex items-center justify-center gap-3">
                        <span className="text-[13px] text-[var(--text-muted)]">Total change</span>
                        <span className={`text-[18px] font-black tabular-nums ${change < 0 ? 'text-[var(--accent)]' : change > 0 ? 'text-[var(--red)]' : 'text-[var(--text-secondary)]'}`}>
                          {change > 0 ? '+' : ''}{change.toFixed(1)} {displayUnit}
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}


              {/* Chart */}
              {weightLogs.length > 0 ? (() => {
                // Aggregate data based on view
                let chartData: { label: string; weight: number }[] = [];
                if (weightChartView === 'day') {
                  chartData = weightLogs.map((l) => ({
                    label: l.date,
                    weight: l.weight,
                  }));
                } else if (weightChartView === 'week') {
                  const byWeek: Record<string, number[]> = {};
                  weightLogs.forEach((l) => {
                    const d = parseDateAtStartOfDay(l.date);
                    if (!d) return;
                    const key = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                    (byWeek[key] = byWeek[key] || []).push(l.weight);
                  });
                  chartData = Object.entries(byWeek)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, vals]) => ({
                      label: key,
                      weight: vals.reduce((s, v) => s + v, 0) / vals.length,
                    }));
                } else {
                  const byMonth: Record<string, number[]> = {};
                  weightLogs.forEach((l) => {
                    const d = parseDateAtStartOfDay(l.date);
                    if (!d) return;
                    const key = format(startOfMonth(d), 'yyyy-MM-dd');
                    (byMonth[key] = byMonth[key] || []).push(l.weight);
                  });
                  chartData = Object.entries(byMonth)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, vals]) => ({
                      label: key,
                      weight: vals.reduce((s, v) => s + v, 0) / vals.length,
                    }));
                }

                const labelFmt = weightChartView === 'month' ? 'MMM yy' : 'MMM d';
                const tooltipFmt = weightChartView === 'month' ? 'MMMM yyyy' : weightChartView === 'week' ? "'Wk of' MMM d, yyyy" : 'EEE, MMM d yyyy';

                return (
                  <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Weight Trend</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{weightLogs.length} {weightLogs.length === 1 ? 'entry' : 'entries'}</p>
                    </div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#C8FF00" stopOpacity={0.30} />
                              <stop offset="100%" stopColor="#C8FF00" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                          <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                            tickFormatter={(val) => formatStoredDate(val, labelFmt)} interval="preserveStartEnd" />
                          <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 12, padding: '8px 12px' }}
                            cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 2' }}
                            labelFormatter={(val) => formatStoredDate(val, tooltipFmt)}
                            formatter={(value) => [`${(value as number).toFixed(1)} ${displayUnit}`, 'Weight']}
                          />
                          <Area type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2.5} fill="url(#weightGrad)"
                            dot={chartData.length <= 20 ? { fill: 'var(--accent)', strokeWidth: 0, r: 3 } : false}
                            activeDot={{ r: 5, fill: 'var(--accent)', stroke: '#111419', strokeWidth: 2 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* View tabs + edit icon */}
                    <div className="mt-4 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowEditEntries(true)}
                        aria-label="Edit weight entries"
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all active:scale-90"
                        style={{ color: 'var(--accent)' }}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <div
                        className="flex items-center gap-1 p-1 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        {(['day', 'week', 'month'] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setWeightChartView(v)}
                            className="px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-[0.1em] transition-all"
                            style={
                              weightChartView === v
                                ? { background: 'var(--accent)', color: '#000' }
                                : { color: 'rgba(255,255,255,0.35)' }
                            }
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
                    <Scale className="w-6 h-6 text-[var(--text-muted)] opacity-40" />
                  </div>
                  <p className="text-[15px] font-bold text-white mb-1">No weight logs yet</p>
                  <p className="text-[13px] text-[var(--text-muted)]">Log your first entry above to see your trend.</p>
                </div>
              )}

              {/* BMI Calculator */}
              {(() => {
                const saveHeight = () => {
                  let cm = '';
                  if (heightUnit === 'cm') {
                    cm = heightCm;
                  } else {
                    const ft = parseFloat(heightFt) || 0;
                    const inches = parseFloat(heightIn) || 0;
                    const totalCm = (ft * 12 + inches) * 2.54;
                    cm = totalCm > 0 ? totalCm.toFixed(1) : '';
                    setHeightCm(cm);
                  }
                  if (cm) {
                    localStorage.setItem('athlix_height_cm', cm);
                    localStorage.setItem('athlix_height_unit', heightUnit);
                  }
                  setHeightEditing(false);
                };

                const bmi = bmiValue ? parseFloat(bmiValue) : null;
                const bmiColor = !bmi ? 'var(--text-muted)'
                  : bmi < 18.5 ? '#38bdf8'
                  : bmi < 25 ? 'var(--accent)'
                  : bmi < 30 ? '#facc15'
                  : 'var(--red)';
                const bmiLabel = !bmi ? null
                  : bmi < 18.5 ? 'Underweight'
                  : bmi < 25 ? 'Healthy weight'
                  : bmi < 30 ? 'Overweight'
                  : 'Obese';

                // BMI scale bar: range 10–40, mark position for bmi
                const bmiBarPct = bmi ? Math.min(100, Math.max(0, ((bmi - 10) / 30) * 100)) : null;

                // Ideal weight range for this height (BMI 18.5–24.9)
                const hM = parseFloat(heightCm) / 100;
                const idealMin = hM > 0 ? (18.5 * hM * hM) : null;
                const idealMax = hM > 0 ? (24.9 * hM * hM) : null;
                const currentWeightKg = weightLogs.length > 0
                  ? (displayUnit === 'lbs' ? weightLogs[weightLogs.length - 1].weight / 2.20462 : weightLogs[weightLogs.length - 1].weight)
                  : null;
                const idealMinDisplay = idealMin ? (displayUnit === 'lbs' ? idealMin * 2.20462 : idealMin) : null;
                const idealMaxDisplay = idealMax ? (displayUnit === 'lbs' ? idealMax * 2.20462 : idealMax) : null;
                const weightStatus = currentWeightKg && idealMin && idealMax
                  ? currentWeightKg < idealMin ? 'below'
                  : currentWeightKg > idealMax ? 'above'
                  : 'ideal'
                  : null;

                return (
                  <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5 space-y-4">

                    {/* Title row */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">BMI Calculator</p>
                      <button
                        type="button"
                        onClick={() => setShowBmiInfo((v) => !v)}
                        className="flex items-center justify-center h-6 w-6 rounded-full transition-all active:scale-90"
                        style={{ background: showBmiInfo ? 'rgba(200,255,0,0.12)' : 'rgba(255,255,255,0.06)', border: showBmiInfo ? '1px solid rgba(200,255,0,0.2)' : '1px solid rgba(255,255,255,0.1)' }}
                        aria-label="What is BMI?"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <circle cx="5" cy="5" r="4.5" stroke={showBmiInfo ? 'var(--accent)' : 'rgba(255,255,255,0.4)'} strokeWidth="0.9" />
                          <text x="5" y="7.2" textAnchor="middle" fill={showBmiInfo ? 'var(--accent)' : 'rgba(255,255,255,0.4)'} fontSize="6" fontWeight="700" fontFamily="system-ui">i</text>
                        </svg>
                      </button>
                    </div>

                    {/* Info panel */}
                    {showBmiInfo && (
                      <div
                        className="rounded-xl p-3 space-y-1.5"
                        style={{ background: 'rgba(200,255,0,0.05)', border: '1px solid rgba(200,255,0,0.13)' }}
                      >
                        <p className="text-[12px] font-black text-white">What is BMI?</p>
                        <p className="text-[11px] leading-relaxed text-white/50">
                          Body Mass Index (BMI) is a simple number calculated from your height and weight. It's a quick screening tool — not a diagnostic — to categorise weight status.
                        </p>
                        <div className="grid grid-cols-4 gap-1.5 pt-1">
                          {[
                            { label: '< 18.5', tag: 'Under', color: '#38bdf8' },
                            { label: '18.5–24.9', tag: 'Healthy', color: 'var(--accent)' },
                            { label: '25–29.9', tag: 'Over', color: '#facc15' },
                            { label: '≥ 30', tag: 'Obese', color: 'var(--red)' },
                          ].map(({ label, tag, color }) => (
                            <div key={tag} className="flex flex-col items-center gap-0.5 rounded-lg py-1.5 px-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
                              <span className="text-[9px] font-black" style={{ color }}>{tag}</span>
                              <span className="text-[8px] text-white/30 tabular-nums">{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Height input / saved display */}
                    {heightEditing ? (
                      <div className="space-y-3">
                        {/* Unit toggle */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Height unit</span>
                          <div
                            className="flex items-center gap-0.5 ml-auto rounded-lg p-0.5"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            {(['cm', 'ftin'] as const).map((u) => (
                              <button
                                key={u}
                                type="button"
                                onClick={() => setHeightUnit(u)}
                                className="px-3 py-1 rounded-lg text-[11px] font-black transition-all"
                                style={heightUnit === u ? { background: 'var(--accent)', color: '#000' } : { color: 'rgba(255,255,255,0.35)' }}
                              >
                                {u === 'cm' ? 'CM' : 'FT / IN'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Inputs */}
                        {heightUnit === 'cm' ? (
                          <input
                            type="number" min="100" max="250" step="0.5"
                            value={heightCm}
                            onChange={(e) => setHeightCm(e.target.value)}
                            placeholder="e.g. 175"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[15px] font-semibold focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-white/20"
                          />
                        ) : (
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type="number" min="3" max="8" step="1"
                                value={heightFt}
                                onChange={(e) => setHeightFt(e.target.value)}
                                placeholder="5"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white text-[15px] font-semibold focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-white/20"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-white/30">ft</span>
                            </div>
                            <div className="flex-1 relative">
                              <input
                                type="number" min="0" max="11" step="0.5"
                                value={heightIn}
                                onChange={(e) => setHeightIn(e.target.value)}
                                placeholder="10"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white text-[15px] font-semibold focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-white/20"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-white/30">in</span>
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={saveHeight}
                          disabled={heightUnit === 'cm' ? !heightCm : (!heightFt && !heightIn)}
                          className="w-full h-11 rounded-xl text-[13px] font-black tracking-[0.1em] text-black transition-all active:scale-[0.97] disabled:opacity-30"
                          style={{ background: 'var(--accent)' }}
                        >
                          SAVE HEIGHT
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Your Height</p>
                          <p className="text-[16px] font-black text-white mt-0.5">
                            {heightUnit === 'ftin' && heightFt
                              ? `${heightFt}′ ${parseFloat(heightIn || '0').toFixed(0)}″  ·  ${parseFloat(heightCm).toFixed(0)} cm`
                              : `${parseFloat(heightCm).toFixed(0)} cm`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setHeightEditing(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all active:scale-90"
                          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.09)' }}
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      </div>
                    )}

                    {/* BMI result */}
                    {bmi !== null && (
                      <div className="space-y-3">
                        {/* Number + label */}
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)] mb-1">Your BMI</p>
                            <span className="text-[36px] font-black tabular-nums leading-none" style={{ color: bmiColor }}>{bmiValue}</span>
                          </div>
                          <span
                            className="mb-1 rounded-full px-3 py-1 text-[11px] font-black"
                            style={{ background: `color-mix(in srgb, ${bmiColor} 12%, transparent)`, color: bmiColor, border: `1px solid color-mix(in srgb, ${bmiColor} 22%, transparent)` }}
                          >
                            {bmiLabel}
                          </span>
                        </div>

                        {/* Scale bar */}
                        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: '100%',
                              background: 'linear-gradient(to right, #38bdf8 0%, var(--accent) 30%, #facc15 65%, var(--red) 100%)',
                            }}
                          />
                          {/* Marker */}
                          {bmiBarPct !== null && (
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-3.5 w-1.5 rounded-full bg-white shadow-lg"
                              style={{ left: `calc(${bmiBarPct}% - 3px)` }}
                            />
                          )}
                        </div>
                        <div className="flex justify-between text-[9px] font-semibold text-white/25">
                          <span>10</span><span>Healthy 18.5–24.9</span><span>40</span>
                        </div>

                        {/* Weight vs ideal */}
                        {weightStatus && idealMinDisplay && idealMaxDisplay && (
                          <div
                            className="rounded-xl px-4 py-3 flex items-center justify-between"
                            style={{
                              background: weightStatus === 'ideal' ? 'rgba(200,255,0,0.06)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${weightStatus === 'ideal' ? 'rgba(200,255,0,0.16)' : 'rgba(255,255,255,0.07)'}`,
                            }}
                          >
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Ideal range for your height</p>
                              <p className="text-[13px] font-black text-white mt-0.5">
                                {idealMinDisplay.toFixed(1)} – {idealMaxDisplay.toFixed(1)} {displayUnit}
                              </p>
                            </div>
                            <span
                              className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black"
                              style={
                                weightStatus === 'ideal'
                                  ? { background: 'rgba(200,255,0,0.12)', color: 'var(--accent)' }
                                  : weightStatus === 'below'
                                  ? { background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }
                                  : { background: 'rgba(239,68,68,0.12)', color: 'var(--red)' }
                              }
                            >
                              {weightStatus === 'ideal' ? '✓ On track' : weightStatus === 'below' ? '↑ Below' : '↓ Above'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── All entries popup ── */}
              {showEditEntries && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[65] flex items-end justify-center"
                  style={{ background: 'rgba(18,18,24,0.88)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }}
                  onClick={() => setShowEditEntries(false)}
                >
                  <motion.div
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 80, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-[480px] rounded-t-[24px] flex flex-col"
                    style={{ background: '#13171e', border: '1px solid rgba(255,255,255,0.09)', maxHeight: '75vh' }}
                  >
                    {/* Handle */}
                    <div className="w-9 h-1 rounded-full mx-auto mt-3 mb-1 opacity-30" style={{ background: 'var(--text-muted)' }} />

                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                      <div>
                        <p className="text-[15px] font-black text-white">Weight Entries</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{weightLogs.length} {weightLogs.length === 1 ? 'entry' : 'entries'} — tap pencil to edit</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowEditEntries(false)}
                        className="h-8 w-8 flex items-center justify-center rounded-xl transition-all active:scale-90"
                        style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--text-muted)' }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Scrollable list */}
                    <div className="overflow-y-auto flex-1 divide-y divide-white/[0.05] pb-[env(safe-area-inset-bottom)]">
                      {[...weightLogs].reverse().map((log, i) => (
                        <div key={log.id} className="flex items-center justify-between px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-1.5 h-8 rounded-full shrink-0"
                              style={{ background: i === 0 ? 'var(--accent)' : 'rgba(255,255,255,0.1)' }}
                            />
                            <div>
                              <p className="text-[13px] font-semibold text-white leading-tight">
                                {formatStoredDate(log.date, 'EEE, MMM d yyyy')}
                              </p>
                              <p className="text-[12px] font-black tabular-nums mt-0.5" style={{ color: i === 0 ? 'var(--accent)' : 'rgba(255,255,255,0.55)' }}>
                                {log.weight.toFixed(1)} <span className="text-[10px] font-semibold">{log.unit ?? displayUnit}</span>
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setEditEntry(log); setEditWeight(log.weight.toFixed(1)); }}
                            className="flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-90"
                            style={{ background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.18)' }}
                            aria-label="Edit entry"
                          >
                            <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              )}

              {/* ── Edit weight entry modal ── */}
              {editEntry && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[70] flex items-center justify-center px-5"
                  style={{ background: 'rgba(18,18,24,0.88)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }}
                  onClick={() => { setEditEntry(null); setEditWeight(''); }}
                >
                  <motion.div
                    initial={{ scale: 0.92, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0, y: 10 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-[340px] rounded-2xl p-6 flex flex-col gap-5"
                    style={{ background: '#161a22', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
                        style={{ background: 'rgba(200,255,0,0.09)', border: '1px solid rgba(200,255,0,0.18)' }}
                      >
                        <Pencil className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                      </div>
                      <div>
                        <p className="text-[15px] font-black text-white leading-tight">Edit Entry</p>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {formatStoredDate(editEntry.date, 'EEEE, MMM d yyyy')}
                        </p>
                      </div>
                    </div>

                    {/* Unit caution */}
                    <div
                      className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                      style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.14)' }}
                    >
                      <Info className="h-3.5 w-3.5 mt-px shrink-0" style={{ color: 'var(--accent)' }} />
                      <p className="text-[11px] font-semibold leading-snug" style={{ color: 'rgba(200,255,0,0.75)' }}>
                        Entering in <span className="font-black">{displayUnit.toUpperCase()}</span> — your current unit from Settings.
                      </p>
                    </div>

                    {/* Weight input */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                        New Weight ({displayUnit})
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="20"
                          max="500"
                          autoFocus
                          value={editWeight}
                          onChange={(e) => setEditWeight(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleEditWeight()}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[16px] font-bold focus:outline-none focus:border-[var(--accent)] transition-colors"
                        />
                        <span className="flex items-center text-[12px] font-semibold text-[var(--text-muted)] px-1">{displayUnit}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => { setEditEntry(null); setEditWeight(''); }}
                        className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white/70 transition-all active:scale-[0.97]"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        CANCEL
                      </button>
                      <button
                        type="button"
                        onClick={handleEditWeight}
                        disabled={!editWeight}
                        className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-black transition-all active:scale-[0.97] disabled:opacity-30"
                        style={{ background: 'var(--accent)' }}
                      >
                        SAVE
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </>
          )}

          {/* ════════════════════════════════════════════════
              LIVE HEART RATE
          ════════════════════════════════════════════════ */}
          {activeTab === 'livehr' && (
            <>
              {/* Connect banner */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#0F1520_0%,#0A1018_100%)] p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Heart className="w-4 h-4 text-[var(--heart-rate)]" />
                      <h2 className="text-[15px] font-bold text-white">Live Heart Rate</h2>
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)]">Real-time wearable broadcast with zone tracking.</p>
                  </div>
                  {!hrConnected ? (
                    <button
                      onClick={supportsWebBluetooth ? connectHeartRate : undefined}
                      disabled={hrConnecting || !supportsWebBluetooth}
                      title={!supportsWebBluetooth && unsupportedBluetoothHint ? unsupportedBluetoothHint : undefined}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-bold transition-all ${
                        supportsWebBluetooth
                          ? 'bg-[var(--heart-rate)] text-black hover:opacity-90 disabled:opacity-50'
                          : 'border border-white/15 bg-white/5 text-[#98A6B8] opacity-70'
                      }`}
                    >
                      <PlugZap className="w-4 h-4" />
                      {!supportsWebBluetooth ? (isIOSBrowser ? 'Unavailable on iOS' : 'Unsupported') : hrConnecting ? 'Connecting…' : 'Connect device'}
                    </button>
                  ) : (
                    <button
                      onClick={disconnectHeartRate}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-white/8 transition-colors"
                    >
                      <Unplug className="w-4 h-4" />
                      Disconnect · {hrDeviceName || 'Device'}
                    </button>
                  )}
                </div>
              </div>

              {/* BPM hero */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#0F1520_0%,#0A1018_100%)] overflow-hidden">
                {/* Decorative waveform strip */}
                <div className="relative h-14 border-b border-white/6 overflow-hidden"
                  style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)' }}>
                  <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
                    <defs>
                      <linearGradient id="heroWaveGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(25,204,240,0.15)" />
                        <stop offset="40%" stopColor="#19CCF0" />
                        <stop offset="70%" stopColor="var(--accent)" />
                        <stop offset="100%" stopColor="rgba(200,255,0,0.15)" />
                      </linearGradient>
                    </defs>
                    <motion.polyline fill="none" stroke="rgba(200,255,0,0.15)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" points={heroWavePoints}
                      animate={hrConnected ? { opacity: [0.1, 0.3, 0.1] } : { opacity: 0.1 }}
                      transition={hrConnected ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }} />
                    <polyline fill="none" stroke="url(#heroWaveGrad2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={heroWavePoints} />
                  </svg>
                </div>

                <div className="p-6">
                  {/* BPM display */}
                  <div className="flex items-end justify-between mb-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--text-secondary)] mb-2">Beats Per Minute</p>
                      <div className="flex items-end gap-3">
                        <motion.span
                          className="text-[72px] font-black text-white tabular-nums leading-none"
                          key={currentBpm}
                          initial={{ opacity: 0.6, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.15 }}
                        >
                          {currentBpm ?? '--'}
                        </motion.span>
                        <div className="mb-2">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-semibold"
                            style={{ borderColor: `${hrZone.color}55`, background: `${hrZone.color}18`, color: hrZone.color }}>
                            {hrZone.label}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Pulsing heart icon */}
                    <div className="relative flex items-center justify-center w-20 h-20">
                      {hrConnected && (
                        <>
                          <motion.div className="absolute inset-0 rounded-full border border-[var(--accent)]/20"
                            animate={{ scale: [1, 1.3], opacity: [0.4, 0] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
                          <motion.div className="absolute inset-0 rounded-full border border-[var(--accent)]/15"
                            animate={{ scale: [1, 1.18], opacity: [0.3, 0] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: 0.4 }} />
                        </>
                      )}
                      <motion.div
                        className="relative w-14 h-14 rounded-2xl flex items-center justify-center border border-[var(--accent)]/25"
                        style={{ background: 'rgba(200,255,0,0.08)' }}
                        animate={hrConnected ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                        transition={hrConnected ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}
                      >
                        <Heart className={`w-6 h-6 ${hrConnected ? 'text-[var(--accent)]' : 'text-[#5A6577]'}`}
                          style={{ fill: hrConnected ? 'rgba(200,255,0,0.15)' : 'transparent' }} strokeWidth={2} />
                      </motion.div>
                    </div>
                  </div>

                  {/* Intensity bar */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">Intensity</span>
                      <span className="text-[10px] font-semibold text-[var(--text-secondary)]">{hrIntensityPercent.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-white/8">
                      <motion.div className="h-full rounded-full"
                        style={{ background: 'linear-gradient(90deg, #5DCAA5 0%, var(--accent) 40%, #FFCC00 72%, #FF5A5F 100%)' }}
                        animate={{ width: `${hrIntensityPercent}%` }}
                        transition={{ duration: 0.25 }} />
                    </div>
                  </div>

                  {/* Stat pills */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Trend', value: hrTrend || 'Waiting' },
                      { label: 'Avg 30s', value: hrRollingAvg ? `${hrRollingAvg} bpm` : '--' },
                      { label: 'Min / Max', value: hrSessionMin && hrSessionMax ? `${hrSessionMin} / ${hrSessionMax}` : '--' },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-[0.14em] mb-1">{label}</p>
                        <p className="text-[12px] font-semibold text-white tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Waveform card */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#0F1520_0%,#0A1018_100%)] p-5">
                {/* Waveform header */}
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-bold text-white">
                        {heartRateView === 'week' ? 'Weekly HR' : heartRateView === 'month' ? 'Monthly HR' : 'Live Waveform'}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        {heartRateView === 'week' ? 'Daily avg heart rate this week'
                          : heartRateView === 'month' ? 'Weekly avg heart rate this month'
                          : waveformVisibleActualData.length > 1
                            ? `${format(new Date(waveformVisibleActualData[0].ts), 'h:mm a')} – ${format(new Date(waveformVisibleActualData[waveformVisibleActualData.length - 1].ts), 'h:mm a')}`
                            : 'Waiting for data…'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {selectedZoneFilter !== null && isLineHeartRateView && (
                        <span className="px-2.5 py-1 rounded-full border text-[10px] font-bold" style={{
                          borderColor: `${HEART_RATE_ZONES[selectedZoneFilter].color}66`,
                          color: HEART_RATE_ZONES[selectedZoneFilter].color,
                          background: `${HEART_RATE_ZONES[selectedZoneFilter].color}18`,
                        }}>
                          {HEART_RATE_ZONES[selectedZoneFilter].name}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                        <Bluetooth className="w-3.5 h-3.5" />
                        {hrConnected ? (hrDeviceName || 'Connected') : 'Disconnected'}
                      </span>
                      <button
                        onClick={jumpWaveformLive}
                        className={`h-7 px-3 rounded-lg border text-[10px] font-bold transition-colors ${
                          heartRateView === 'live' && waveformAtLive
                            ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                            : 'bg-black/30 border-white/15 text-[#AFC0D8] hover:text-white'
                        }`}
                      >
                        Live
                      </button>
                    </div>
                  </div>

                  {/* Mode tabs */}
                  <div className="flex gap-1 p-1 rounded-xl bg-black/20 border border-white/8 self-start">
                    {(['live', 'day', 'week', 'month'] as HeartRateViewMode[]).map((mode) => (
                      <button key={mode} onClick={() => setHeartRateView(mode)}
                        className={`h-8 px-3.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                          heartRateView === mode
                            ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
                            : 'text-[#9AACBF] border border-transparent hover:text-white hover:bg-white/5'
                        }`}>
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {isLineHeartRateView ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        {heartRateView === 'live' ? 'Drag to pan · pinch to zoom up to 12h' : 'Current day timeline · pinch to zoom'}
                      </p>
                      <p className="text-[11px] font-medium text-[var(--text-secondary)]">
                        {Math.max(1, Math.round(effectiveWaveformDurationMs / (60 * 1000)))} min window
                      </p>
                    </div>

                    <div
                      className="h-60 rounded-xl border border-white/8 bg-black/20 px-2 py-3 cursor-grab active:cursor-grabbing overflow-hidden"
                      onWheel={handleWaveformWheel}
                      onPointerDown={handleWaveformPointerDown}
                      onPointerMove={handleWaveformPointerMove}
                      onPointerUp={(e) => clearWaveformDrag(e.pointerId)}
                      onPointerCancel={(e) => clearWaveformDrag(e.pointerId)}
                      onPointerLeave={(e) => clearWaveformDrag(e.pointerId)}
                    >
                      {waveformVisibleActualData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={waveformVisibleData} margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
                            <defs>
                              <linearGradient id="liveWaveFill2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={activeWaveAreaTop} />
                                <stop offset="42%" stopColor={activeWaveAreaMid} />
                                <stop offset="100%" stopColor={activeWaveAreaBottom} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="ts" type="number" domain={[waveformVisibleStartTs, waveformVisibleEndTs]}
                              tickFormatter={(v: number) => format(new Date(v), 'h:mm a')}
                              stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickMargin={8} minTickGap={34} />
                            <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={36}
                              domain={[(min: number) => Math.max(0, Math.floor(min - 6)), (max: number) => Math.ceil(max + 6)]} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0F1520', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff' }}
                              formatter={(value: any, name: any, payload: any) => {
                                if (name === 'gapGuide' || payload?.payload?.isGap) return ['No data', 'Gap'];
                                return [value == null ? 'No data' : `${value} bpm`, payload?.payload?.zoneLabel || 'Heart Rate'];
                              }}
                              labelFormatter={(v: any) => format(new Date(v as number), 'h:mm:ss a')} />
                            <Area type="monotone" dataKey={activeWaveDataKey} stroke="none" fill="url(#liveWaveFill2)" connectNulls={false} isAnimationActive={false} />
                            <Line type="linear" dataKey="gapGuide" stroke="rgba(143,157,177,0.3)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} connectNulls={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey="bpm" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey={activeWaveDataKey} stroke={activeWaveStroke} strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-center text-[13px] text-[var(--text-muted)]">
                          {hrConnected ? 'Waiting for incoming data…' : supportsWebBluetooth ? 'Connect device to start stream.' : 'Unsupported in this browser.'}
                        </div>
                      )}
                    </div>

                    {/* Zone filter */}
                    <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] text-[var(--text-secondary)]">Zone filter {waveformHasGapSegments ? '· dashed = no data' : ''}</span>
                        <span className="text-[11px]">Now: <span style={{ color: hrZone.color }} className="font-semibold">{hrZone.label}</span></span>
                      </div>
                      <div className="relative">
                        {zoneHintLabel && useCompactZoneLabels && (
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg border border-white/20 bg-[var(--bg-elevated)]/95 text-[11px] font-medium text-[var(--text-primary)] whitespace-nowrap z-10">
                            {zoneHintLabel}
                          </div>
                        )}
                        <div className="grid grid-cols-6 gap-1">
                          <button onClick={() => setSelectedZoneFilter(null)}
                            onPointerDown={() => handleZoneHintStart('All zones')} onPointerUp={handleZoneHintEnd} onPointerLeave={handleZoneHintEnd} onPointerCancel={handleZoneHintEnd}
                            className={`h-9 rounded-lg border text-[10px] font-bold transition-colors ${
                              selectedZoneFilter === null
                                ? 'bg-[var(--accent)]/18 border-[var(--accent)]/45 text-[var(--accent)]'
                                : 'bg-transparent border-white/10 text-[#9DB0C6] hover:text-white hover:bg-white/5'
                            }`}>
                            All
                          </button>
                          {zoneDistribution.map((zone, idx) => (
                            <button key={zone.id}
                              onClick={() => setSelectedZoneFilter((prev) => (prev === idx ? null : idx))}
                              onPointerDown={() => handleZoneHintStart(`${zone.name} (${zone.range} bpm)`)} onPointerUp={handleZoneHintEnd} onPointerLeave={handleZoneHintEnd} onPointerCancel={handleZoneHintEnd}
                              className={`h-9 rounded-lg border text-[10px] font-bold transition-colors ${
                                selectedZoneFilter === idx ? 'text-white' : currentZoneIndex === idx ? 'text-white bg-black/25' : 'text-[#9DB0C6] hover:text-white hover:bg-white/5'
                              }`}
                              style={{
                                borderColor: selectedZoneFilter === idx ? `${zone.color}CC` : currentZoneIndex === idx ? `${zone.color}66` : 'rgba(255,255,255,0.1)',
                                background: selectedZoneFilter === idx ? `linear-gradient(180deg, ${zone.color}22 0%, rgba(8,14,23,0.85) 100%)` : undefined,
                              }}>
                              {useCompactZoneLabels ? (ZONE_SHORT_LABEL_BY_ID[zone.id] || zone.name) : zone.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-60 rounded-xl border border-white/8 bg-black/15 overflow-hidden">
                    {hasPeriodBarData ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={periodHeartRateBars} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="label" stroke="var(--text-muted)" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
                          <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                            contentStyle={{ backgroundColor: '#0F1520', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff' }}
                            formatter={(value: any, _name: any, payload: any) => [
                              payload?.payload?.avgBpm ? `${value} bpm` : 'No data', payload?.payload?.longLabel || 'Average HR',
                            ]} />
                          <Bar dataKey={(entry) => entry.avgBpm ?? 0} radius={[8, 8, 3, 3]}>
                            {periodHeartRateBars.map((entry, i) => (
                              <Cell key={`${entry.label}-${i}`} fill={entry.avgBpm == null ? 'rgba(255,255,255,0.07)' : entry.color} fillOpacity={entry.avgBpm == null ? 1 : 0.9} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-[13px] text-[var(--text-muted)]">
                        No heart-rate history for this {heartRateView}.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {hrError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[13px] text-red-200">{hrError}</div>
              )}

              {/* Setup guide */}
              <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
                <p className="text-[13px] font-bold text-white mb-3">Device Setup</p>
                <div className="space-y-2">
                  {[
                    'On your wearable, enable Heart Rate Broadcast mode.',
                    'Keep the wearable nearby, charged, and ready to pair.',
                    supportsWebBluetooth ? 'Open this Live HR view and tap Connect device.' : 'Use Android Chrome or desktop Chrome/Edge for live pairing.',
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/8 border border-white/14 flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)]">{i + 1}</span>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {!supportsWebBluetooth && unsupportedBluetoothHint && (
                <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/8 p-4 text-[12px] text-yellow-100 flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />{unsupportedBluetoothHint}
                </div>
              )}

              {bluetoothSupportHint && (
                <div className="rounded-xl border border-sky-400/25 bg-sky-400/8 p-4 text-[12px] text-sky-100 flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />{bluetoothSupportHint}
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>

    </div>
  );

};

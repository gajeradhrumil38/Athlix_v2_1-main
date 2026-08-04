import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Trophy, ArrowRight, Flame, Zap, AlertTriangle, Scale, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProgress } from '../contexts/ProgressContext';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, isSameDay, isSameWeek, isSameMonth, addWeeks, subWeeks, subDays, addDays, addMonths, subMonths, isAfter, startOfDay } from 'date-fns';
import { MuscleMap, MuscleData } from '../components/home/MuscleMap';
import { WeeklyRing } from '../components/home/WeeklyRing';
import { GoalEditSheet } from '../components/home/GoalEditSheet';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { getBodyWeightLogs, getCustomExerciseSlugMap, getPersonalRecords, getWorkouts } from '../lib/supabaseData';
import { parseDateAtStartOfDay } from '../lib/dates';
import { getExerciseMuscleProfile, getMuscleSlugLabel, PRIMARY_LOAD_WEIGHT, SECONDARY_LOAD_WEIGHT } from '../lib/exerciseMuscles';
import { convertWeight, isWeightUnit, type WeightUnit } from '../lib/units';
import { WhoopDashboard } from '../features/whoop/components/WhoopDashboard';
import { MuscleRadar } from '../components/home/MuscleRadar';
import { AppIcon } from '../config/icons';

// --- Utility Functions ---
const calculateStreak = (workouts: { date: string }[]) => {
  if (!workouts || workouts.length === 0) return 0;
  
  const getDayTimestamp = (value: string) => parseDateAtStartOfDay(value)?.getTime() ?? 0;
  const uniqueDates = Array.from(new Set(workouts.map((w) => w.date))).sort(
    (a, b) => getDayTimestamp(b) - getDayTimestamp(a),
  );
  
  let streak = 0;
  let currentDate = startOfDay(new Date());
  
  // Check if they worked out today
  const latestWorkoutDate = uniqueDates.length > 0 ? parseDateAtStartOfDay(uniqueDates[0]) : null;
  if (latestWorkoutDate && isSameDay(latestWorkoutDate, currentDate)) {
    streak = 1;
    currentDate = subDays(currentDate, 1);
    uniqueDates.shift();
  } else if (latestWorkoutDate && isSameDay(latestWorkoutDate, subDays(currentDate, 1))) {
    // Or yesterday
    currentDate = subDays(currentDate, 1);
  } else {
    return 0; // No workout today or yesterday, streak broken
  }

  for (const dateStr of uniqueDates) {
    const date = parseDateAtStartOfDay(dateStr);
    if (!date) continue;
    if (isSameDay(date, currentDate)) {
      streak++;
      currentDate = subDays(currentDate, 1);
    } else {
      break;
    }
  }
  return streak;
};

const CountUp = ({ value, duration = 600, decimals = 0 }: { value: number, duration?: number, decimals?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const start = 0;
    const end = value;
    if (start === end) return;

    let startTime: number | null = null;
    let frameId = 0;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(progress * (end - start) + start);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };
    frameId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [value, duration]);

  return <>{count.toFixed(decimals)}</>;
};

const BACK_VIEW_SLUGS = new Set([
  'hamstring',
  'gluteal',
  'calves',
  'lower-back',
  'upper-back',
  'trapezius',
]);

// --- Main Component ---
export const Home: React.FC = () => {
  const { user, profile } = useAuth();
  const { startProgress, doneProgress } = useProgress();
  const displayUnit = profile?.unit_preference || 'lbs';
  const location = useLocation();
  const navigate = useNavigate();
  const { visibleWidgets, loading: layoutLoading } = useDashboardLayout();
  const muscleMapRef = useRef<HTMLDivElement | null>(null);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'Day' | 'Week' | 'Month'>(
    () => (localStorage.getItem('defaultView') as 'Day' | 'Week' | 'Month') || 'Week'
  );
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [allWorkouts, setAllWorkouts] = useState<any[]>([]);
  const [rangeWorkouts, setRangeWorkouts] = useState<any[]>([]);
  const [todaysWorkout, setTodaysWorkout] = useState<any | null>(null);
  const [prs, setPrs] = useState<any[]>([]);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  
  const [exerciseSlugMap, setExerciseSlugMap] = useState<Map<string, { slug: string; type: 'primary' | 'secondary' }[]>>(new Map());
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const [currentPrIndex, setCurrentPrIndex] = useState(0);
  const [goalDays, setGoalDays] = useState<number>(() => {
    const stored = localStorage.getItem('athlix:weekly_goal_days');
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return !isNaN(parsed) && parsed >= 1 && parsed <= 7 ? parsed : 4;
  });
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const targetWeightUnit = displayUnit as WeightUnit;

  const toDisplayExerciseWeight = useCallback((exercise: any) => {
    if (exercise.unit && !isWeightUnit(exercise.unit)) return 0;
    return convertWeight(
      Number(exercise.weight || 0),
      isWeightUnit(exercise.unit) ? exercise.unit : targetWeightUnit,
      targetWeightUnit,
      0.1,
    );
  }, [targetWeightUnit]);

  const bodyWeightKg = useMemo(() => {
    if (!profile?.body_weight) return null;
    return profile.body_weight_unit === 'lbs'
      ? Number(profile.body_weight) * 0.45359237
      : Number(profile.body_weight);
  }, [profile?.body_weight, profile?.body_weight_unit]);

  useEffect(() => {
    if (prs.length > 1) {
      const interval = setInterval(() => {
        setCurrentPrIndex(prev => (prev + 1) % prs.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [prs.length]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    startProgress();
    setLoading(true);
    setError(null);

    try {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      let rangeStart = currentDate;
      let rangeEnd = currentDate;
      if (viewMode === 'Week') {
        rangeStart = weekStart;
        rangeEnd = weekEnd;
      } else if (viewMode === 'Month') {
        rangeStart = startOfMonth(currentDate);
        rangeEnd = endOfMonth(currentDate);
      }
      const rangeStartStr = format(rangeStart, 'yyyy-MM-dd');
      const rangeEndStr = format(rangeEnd, 'yyyy-MM-dd');

      const [workoutsRes, allWorkoutsRes, prsRes, weightRes, rangeWorkoutsRes, todaysWorkoutRes, slugMapRes] = await Promise.all([
        getWorkouts(user.id, {
          startDate: weekStartStr,
          endDate: weekEndStr,
          includeExercises: true,
        }),
        getWorkouts(user.id),
        getPersonalRecords(user.id, {
          startDate: weekStartStr,
          endDate: weekEndStr,
        }),
        getBodyWeightLogs(user.id),
        getWorkouts(user.id, {
          startDate: rangeStartStr,
          endDate: rangeEndStr,
          includeExercises: true,
        }),
        getWorkouts(user.id, {
          startDate: todayStr,
          endDate: todayStr,
          includeExercises: true,
          limit: 1,
        }),
        getCustomExerciseSlugMap(user.id),
      ]);

      setWorkouts(workoutsRes || []);
      setAllWorkouts(allWorkoutsRes || []);
      setPrs(prsRes || []);
      setRangeWorkouts(rangeWorkoutsRes || []);
      setTodaysWorkout((todaysWorkoutRes && todaysWorkoutRes[0]) || null);
      setExerciseSlugMap(slugMapRes);
      setWeightLogs(
        (weightRes || []).filter((log) => log.date >= format(subDays(new Date(), 30), 'yyyy-MM-dd')).reverse(),
      );
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      doneProgress();
      setLoading(false);
    }
  }, [user, currentDate, viewMode, startProgress, doneProgress]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const navState = location.state as { scrollTo?: string } | null;
    if (navState?.scrollTo !== 'muscle_map') return;
    if (loading || layoutLoading) return;

    if (!visibleWidgets.includes('muscle_map')) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
      return;
    }

    const target = muscleMapRef.current;
    if (!target) return;

    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [layoutLoading, loading, location.pathname, location.search, location.state, navigate, visibleWidgets]);

  // --- Computed Data ---
  const streak = useMemo(() => calculateStreak(allWorkouts), [allWorkouts]);
  
  const totalVolume = useMemo(() => {
    return workouts.reduce((total, w) => {
      return total + (Array.isArray(w.exercises) ? w.exercises.reduce((sum: number, ex: any) => sum + (toDisplayExerciseWeight(ex) * (ex.reps || 0) * (ex.sets || 0)), 0) : 0);
    }, 0);
  }, [workouts, toDisplayExerciseWeight]);

  const muscleData = useMemo(() => {
    const data: MuscleData = {};
    workouts.forEach((workout) => {
      const workoutGroups = new Set<string>();
      (workout.exercises || []).forEach((ex: any) => {
        const slugs = exerciseSlugMap.get((ex.name ?? '').toLowerCase());
        const profile = getExerciseMuscleProfile(ex.name, ex.muscle_group, slugs);
        const exerciseLoad = (toDisplayExerciseWeight(ex) * Number(ex.reps || 0) * Number(ex.sets || 0)) || 0;
        profile.primary.forEach((region) => {
          if (!data[region]) data[region] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
          data[region].sets += (Number(ex.sets || 0) || 0) * PRIMARY_LOAD_WEIGHT;
          data[region].load += exerciseLoad * PRIMARY_LOAD_WEIGHT;
          if (bodyWeightKg && bodyWeightKg > 0) {
            data[region].relativeLoad += (exerciseLoad * PRIMARY_LOAD_WEIGHT) / bodyWeightKg;
          }
          workoutGroups.add(region);
        });
        profile.secondary.forEach((region) => {
          if (!data[region]) data[region] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
          data[region].sets += (Number(ex.sets || 0) || 0) * SECONDARY_LOAD_WEIGHT;
          data[region].load += exerciseLoad * SECONDARY_LOAD_WEIGHT;
          if (bodyWeightKg && bodyWeightKg > 0) {
            data[region].relativeLoad += (exerciseLoad * SECONDARY_LOAD_WEIGHT) / bodyWeightKg;
          }
          workoutGroups.add(region);
        });
      });
      workoutGroups.forEach((region) => {
        if (!data[region]) data[region] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
        data[region].sessions += 1;
      });
    });

    return data;
  }, [workouts, bodyWeightKg, toDisplayExerciseWeight, exerciseSlugMap]);

  const trainedMuscleGroups = Object.keys(muscleData);

  const muscleMapData = useMemo(() => {
    const data: MuscleData = {};
    rangeWorkouts.forEach((workout) => {
      const workoutGroups = new Set<string>();
      (workout.exercises || []).forEach((ex: any) => {
        const sets = Number(ex.sets || 0) || 0;
        const exerciseLoad = (toDisplayExerciseWeight(ex) * Number(ex.reps || 0) * Number(ex.sets || 0)) || 0;
        const slugs2 = exerciseSlugMap.get((ex.name ?? '').toLowerCase());
        const profile = getExerciseMuscleProfile(ex.name, ex.muscle_group, slugs2);
        profile.targets.forEach(({ slug, weight }) => {
          if (!data[slug]) data[slug] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
          data[slug].sets += sets * weight;
          data[slug].load += exerciseLoad * weight;
          if (bodyWeightKg && bodyWeightKg > 0) {
            data[slug].relativeLoad += (exerciseLoad * weight) / bodyWeightKg;
          }
          workoutGroups.add(slug);
        });
      });

      workoutGroups.forEach((slug) => {
        if (!data[slug]) data[slug] = { sessions: 0, sets: 0, load: 0, relativeLoad: 0 };
        data[slug].sessions += 1;
      });
    });
    return data;
  }, [rangeWorkouts, bodyWeightKg, toDisplayExerciseWeight, exerciseSlugMap]);

  useEffect(() => {
    if (viewMode !== 'Day') return;
    if (muscleView !== 'front') return;

    const entries = Object.entries(muscleMapData).filter(([, data]) => (data.relativeLoad || data.load) > 0);
    if (entries.length === 0) return;

    const frontLoad = entries
      .filter(([slug]) => !BACK_VIEW_SLUGS.has(slug))
      .reduce((sum, [, data]) => sum + (data.relativeLoad || data.load || 0), 0);

    const backLoad = entries
      .filter(([slug]) => BACK_VIEW_SLUGS.has(slug))
      .reduce((sum, [, data]) => sum + (data.relativeLoad || data.load || 0), 0);

    if (backLoad > 0 && frontLoad === 0) {
      setMuscleView('back');
    }
  }, [muscleMapData, muscleView, viewMode]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => {
      const date = addDays(start, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const isToday = isSameDay(date, new Date());
      const isFuture = isAfter(date, new Date()) && !isToday;
      const workout = workouts.find(w => w.date === dateStr);
      
      let status: 'trained' | 'rest' | 'future' | 'today-trained' | 'today-rest' = 'future';
      if (isToday) {
        status = workout ? 'today-trained' : 'today-rest';
      } else if (!isFuture) {
        status = workout ? 'trained' : 'rest';
      }

      return {
        date,
        dateStr,
        label: format(date, 'EEEEE'), // M, T, W...
        dayName: format(date, 'EEE'), // Mon, Tue...
        dayNum: format(date, 'd'),
        status,
        workout
      };
    });
  }, [currentDate, workouts]);

  const trainedDaysCount = weekDays.filter(d => d.status === 'trained' || d.status === 'today-trained').length;

  const rangeTitle = useMemo(() => {
    if (viewMode === 'Day') {
      return isSameDay(currentDate, new Date()) ? 'Today' : format(currentDate, 'MMM d');
    }
    if (viewMode === 'Week') {
      return `Week ${format(currentDate, 'w')}`;
    }
    return format(currentDate, 'MMMM');
  }, [viewMode, currentDate]);

  const rangeExercises = useMemo(() => {
    return rangeWorkouts.flatMap((workout) => workout.exercises || []);
  }, [rangeWorkouts]);

  const dayExerciseStats = useMemo(() => {
    if (viewMode !== 'Day') return [];
    const byName = new Map<string, { name: string; volume: number; sets: number; isRun: boolean; runUnit?: string; runMinutes?: number }>();
    rangeExercises.forEach((ex: any) => {
      const isRun = ex.unit === 'km' || ex.unit === 'mi';
      const volume = isRun
        ? Number(ex.weight || 0)
        : (toDisplayExerciseWeight(ex) * Number(ex.reps || 0) * Number(ex.sets || 0));
      const prev = byName.get(ex.name) || { name: ex.name, volume: 0, sets: 0, isRun: false };
      byName.set(ex.name, {
        name: ex.name,
        volume: prev.volume + volume,
        sets: isRun ? prev.sets : prev.sets + (Number(ex.sets || 0) || 0),
        isRun: isRun || prev.isRun,
        runUnit: isRun ? String(ex.unit) : prev.runUnit,
        runMinutes: isRun ? (prev.runMinutes ?? 0) + Number(ex.reps || 0) : prev.runMinutes,
      });
    });
    return Array.from(byName.values()).sort((a, b) => b.volume - a.volume);
  }, [rangeExercises, viewMode, toDisplayExerciseWeight]);

  const muscleLoadStats = useMemo(() => {
    if (viewMode === 'Day') return [];
    return (Object.entries(muscleMapData) as Array<[string, MuscleData[string]]>)
      .map(([slug, data]) => ({
        name: getMuscleSlugLabel(slug),
        volume: data.load,
      }))
      .sort((a, b) => b.volume - a.volume);
  }, [muscleMapData, viewMode]);

  // Map date string → workouts for that day (used in week view day-by-day list)
  const weekWorkoutsByDate = useMemo(() => {
    const map = new Map<string, { title: string; muscleGroups: string[] }[]>();
    rangeWorkouts.forEach((w) => {
      if (!map.has(w.date)) map.set(w.date, []);
      const groups = Array.from(
        new Set((w.exercises || []).map((e: any) => e.muscle_group).filter(Boolean))
      ) as string[];
      map.get(w.date)!.push({ title: w.title || 'Workout', muscleGroups: groups });
    });
    return map;
  }, [rangeWorkouts]);

  const muscleMapTitle = useMemo(() => {
    if (viewMode === 'Day') {
      return isSameDay(currentDate, new Date()) ? "Today's Muscles" : `${format(currentDate, 'MMM d')} Muscles`;
    }
    if (viewMode === 'Week') {
      return `Week ${format(currentDate, 'w')} Muscles`;
    }
    return `${format(currentDate, 'MMMM')} Muscles`;
  }, [viewMode, currentDate]);

  const isCurrentRange = useMemo(() => {
    const now = new Date();
    if (viewMode === 'Day') return isSameDay(currentDate, now);
    if (viewMode === 'Week') return isSameWeek(currentDate, now, { weekStartsOn: 1 });
    return isSameMonth(currentDate, now);
  }, [viewMode, currentDate]);

  // --- Alert Logic ---
  const alert = useMemo(() => {
    if (trainedMuscleGroups.includes('Chest') && !trainedMuscleGroups.includes('Back')) {
      return { type: 'imbalance', icon: 'imbalance', text: 'Muscle imbalance: You trained Chest but not Back.', color: 'var(--yellow)' };
    }
    if (prs.length > 0) {
      return { 
        type: 'pr', 
        icon: 'pr', 
        text: `New PR: ${prs[currentPrIndex]?.exercise_name} ${prs[currentPrIndex]?.best_weight}${displayUnit}`, 
        color: 'var(--pr-gold)' 
      };
    }
    return null;
  }, [trainedMuscleGroups, prs, currentPrIndex, displayUnit]);

  // --- Handlers ---
  const handlePrev = useCallback(() => {
    if (viewMode === 'Week') setCurrentDate(prev => subWeeks(prev, 1));
    else if (viewMode === 'Day') setCurrentDate(prev => subDays(prev, 1));
    else if (viewMode === 'Month') setCurrentDate(prev => subMonths(prev, 1));
  }, [viewMode]);

  const handleNext = useCallback(() => {
    if (viewMode === 'Week') setCurrentDate(prev => addWeeks(prev, 1));
    else if (viewMode === 'Day') setCurrentDate(prev => addDays(prev, 1));
    else if (viewMode === 'Month') setCurrentDate(prev => addMonths(prev, 1));
  }, [viewMode]);

  const handleToday = useCallback(() => setCurrentDate(new Date()), []);
  const handleWorkoutEntry = useCallback(() => {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    navigate(`/log?date=${encodeURIComponent(dateStr)}&direct=1`);
  }, [navigate, currentDate]);

  // --- Render Helpers ---
  if ((loading || layoutLoading) && workouts.length === 0) {
    return (
      <div className="p-3 space-y-2.5">
        <div className="skeleton h-11 rounded-xl" />
        <div className="skeleton h-10 rounded-xl" />
        <div className="skeleton h-8 rounded-xl" />
        <div className="grid grid-cols-4 gap-1.5">
          {[0,1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="skeleton h-60 rounded-xl" />
          <div className="skeleton h-60 rounded-xl" />
        </div>
        <div className="skeleton h-20 rounded-xl" />
        <div className="skeleton h-28 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <p className="text-[var(--text-secondary)] mb-4 text-[14px]">{error}</p>
        <button
          onClick={fetchData}
          className="px-5 py-2.5 bg-[var(--accent)] text-black rounded-xl font-bold text-[14px] active:scale-95 transition-transform"
        >
          Retry
        </button>
      </div>
    );
  }

  const WIDGET_COMPONENTS: Record<string, React.ReactNode> = {
    date_navigator: (
      <div key="date_navigator" className="flex flex-col gap-2">
        <header
          className="sticky top-0 z-40 grid grid-cols-[1fr_auto_1fr] items-center px-1"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            minHeight: 'calc(44px + env(safe-area-inset-top))',
            background: 'var(--bg-base)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          } as React.CSSProperties}
        >
          {/* Left: streak + today */}
          <div className="flex items-center gap-2 justify-self-start min-w-0">
            <div className="flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1 rounded-full border border-[var(--border)]">
              {streak > 7
                ? <Flame className="w-3 h-3 text-[var(--pr-gold)]" />
                : <Zap className="w-3 h-3 text-[var(--accent)]" />}
              <span className="text-[12px] font-bold text-[var(--text-primary)]">{streak}</span>
            </div>
            {!isCurrentRange && (
              <button
                onClick={handleToday}
                className="px-2.5 py-1 text-[10px] font-semibold rounded-full border bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Jump to today"
              >
                Today
              </button>
            )}
          </div>

          {/* Center: date navigator */}
          <div className="flex items-center gap-2 justify-self-center">
            <button onClick={handlePrev} className="p-1 text-[var(--text-muted)] hover:text-[var(--accent)] rounded-full transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={handleToday} className="text-[13px] font-semibold text-[var(--text-primary)] min-w-[64px] text-center hover:text-[var(--accent)] transition-colors">
              {rangeTitle}
            </button>
            <button onClick={handleNext} className="p-1 text-[var(--text-muted)] hover:text-[var(--accent)] rounded-full transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Right: avatar → settings */}
          <div className="justify-self-end flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="w-8 h-8 rounded-full bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)] text-[12px] font-bold border border-[var(--accent)]/20 hover:bg-[var(--accent)]/20 transition-colors"
              aria-label="Open settings"
            >
              {profile?.full_name?.trim().charAt(0).toUpperCase() || 'A'}
            </button>
          </div>
        </header>

        {/* View mode tabs */}
        <div className="flex px-1">
          {(['Day', 'Week', 'Month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex-1 text-center py-1.5 text-[12px] font-medium transition-all duration-200 ${
                viewMode === mode
                  ? 'text-[var(--accent)] border-b-[2px] border-[var(--accent)]'
                  : 'text-[var(--text-muted)] border-b-[2px] border-transparent'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    ),
    quick_stats: null,
    muscle_map: (
      <div key="muscle_map" ref={muscleMapRef} className="flex flex-col h-full">
        <MuscleMap muscleData={muscleMapData} view={muscleView} onViewChange={setMuscleView} title={muscleMapTitle} unit={displayUnit} />
      </div>
    ),
    weekly_goal: (
      <div key="weekly_goal" className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-[10px_8px] h-full flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[9px] uppercase tracking-[1.5px] text-[var(--text-secondary)] font-bold">WEEKLY GOAL</h3>
          <button
            onClick={() => setShowGoalEdit(true)}
            className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)] hover:opacity-80 transition-opacity"
          >
            Edit
          </button>
        </div>
        <WeeklyRing
          trainedDays={trainedDaysCount}
          goalDays={goalDays}
          days={weekDays}
          balanceWarning={alert?.type === 'imbalance' ? alert.text : undefined}
        />
      </div>
    ),
    train_next: (
      <div key="train_next" className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-3 h-full flex flex-col">

        {/* ── DAY VIEW ── */}
        {viewMode === 'Day' && (() => {
          const hasExercises = rangeExercises.length > 0;
          return (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-secondary)] font-semibold">{rangeTitle}</div>
                <button onClick={handleWorkoutEntry} className="text-[10px] font-semibold text-[var(--accent)] hover:opacity-80">
                  {hasExercises ? 'Edit' : 'Start'}
                </button>
              </div>
              {hasExercises ? (
                <div className="flex flex-col gap-2">
                  {dayExerciseStats.slice(0, 4).map((ex) => {
                    const maxVolume = Math.max(dayExerciseStats[0]?.volume || 0, 1);
                    const pct = Math.min((ex.volume / maxVolume) * 100, 100);
                    const sideLabel = ex.isRun
                      ? `${ex.runMinutes ?? 0} min`
                      : `${ex.sets} sets`;
                    return (
                      <div key={ex.name} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                          <span className="truncate">{ex.name}</span>
                          <span className="text-[9px]">{sideLabel}</span>
                        </div>
                        <div className="h-1.5 w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                          <motion.div className="h-full rounded-full" style={{ backgroundColor: 'var(--accent)' }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                  <div className="text-[11px] text-[var(--text-secondary)]">No exercises logged.</div>
                  <button onClick={handleWorkoutEntry} className="px-3 py-1.5 bg-[var(--accent)] text-black text-[10px] font-bold rounded-xl">Start Workout</button>
                </div>
              )}
            </>
          );
        })()}

        {/* ── WEEK VIEW — day-by-day editable list ── */}
        {viewMode === 'Week' && (() => {
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          return (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-secondary)] font-semibold">{rangeTitle}</div>
                <button
                  onClick={() => navigate(`/log?date=${encodeURIComponent(todayStr)}`)}
                  className="text-[10px] font-semibold text-[var(--accent)] hover:opacity-80"
                >
                  + Log Today
                </button>
              </div>
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {weekDays.map((day) => {
                  const dayWorkouts = weekWorkoutsByDate.get(day.dateStr) || [];
                  const trained = dayWorkouts.length > 0;
                  const isToday = day.dateStr === todayStr;
                  const isFuture = isAfter(day.date, new Date()) && !isToday;
                  const groups = Array.from(new Set(dayWorkouts.flatMap(w => w.muscleGroups))).slice(0, 3);

                  return (
                    <button
                      key={day.dateStr}
                      type="button"
                      disabled={isFuture}
                      onClick={() => navigate(`/log?date=${encodeURIComponent(day.dateStr)}`)}
                      className="flex items-center gap-2.5 py-2 text-left w-full disabled:opacity-30 transition-opacity"
                    >
                      {/* Day label */}
                      <div className="flex flex-col items-center w-7 shrink-0">
                        <span className="text-[9px] font-semibold uppercase" style={{ color: isToday ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {day.dayName}
                        </span>
                        <span className="text-[12px] font-bold" style={{ color: isToday ? 'var(--accent)' : trained ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {day.dayNum}
                        </span>
                      </div>

                      {/* Status dot */}
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                        background: trained ? 'var(--accent)' : isToday ? 'rgba(200,255,0,0.3)' : 'var(--text-muted)',
                        boxShadow: trained ? '0 0 6px rgba(200,255,0,0.5)' : 'none',
                      }} />

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {trained ? (
                          <div className="flex flex-wrap gap-1">
                            {groups.map(g => (
                              <span key={g} className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                                {g}
                              </span>
                            ))}
                            {dayWorkouts.flatMap(w => w.muscleGroups).length > 3 && (
                              <span className="text-[9px] text-[var(--text-muted)]">+{dayWorkouts.flatMap(w => w.muscleGroups).length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px]" style={{ color: isToday ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {isToday ? 'Tap to log' : isFuture ? '' : 'Rest'}
                          </span>
                        )}
                      </div>

                      {/* Arrow */}
                      {!isFuture && (
                        <ChevronRight className="w-3 h-3 shrink-0" style={{ color: trained ? 'var(--accent)' : 'var(--text-muted)' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* ── MONTH VIEW ── */}
        {viewMode === 'Month' && (() => {
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          return (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-secondary)] font-semibold">{rangeTitle}</div>
                <button onClick={() => navigate(`/log?date=${encodeURIComponent(todayStr)}`)} className="text-[10px] font-semibold text-[var(--accent)] hover:opacity-80">
                  Log Today
                </button>
              </div>
              {muscleLoadStats.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {muscleLoadStats.slice(0, 4).map((ex) => {
                    const maxVolume = Math.max(muscleLoadStats[0]?.volume || 0, 1);
                    const pct = Math.min((ex.volume / maxVolume) * 100, 100);
                    return (
                      <div key={ex.name} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                          <span className="truncate">{ex.name}</span>
                          <span className="text-[9px]">{ex.volume.toFixed(0)} {displayUnit}</span>
                        </div>
                        <div className="h-1.5 w-full bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                          <motion.div className="h-full rounded-full" style={{ backgroundColor: 'var(--accent)' }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                  <div className="text-[11px] text-[var(--text-secondary)]">No training data this month.</div>
                  <button onClick={() => navigate(`/log?date=${encodeURIComponent(todayStr)}`)} className="px-3 py-1.5 bg-[var(--accent)] text-black text-[10px] font-bold rounded-xl">Log Workout</button>
                </div>
              )}
            </>
          );
        })()}

      </div>
    ),
    pr_banner: alert ? (
      <AnimatePresence mode="wait" key="pr_banner">
        <motion.div 
          key={alert.type === 'pr' ? currentPrIndex : alert.type}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="w-full border rounded-xl p-2.5 flex items-center gap-2.5 animate-card-enter shadow-sm"
          style={{ 
            animationDelay: '180ms',
            backgroundColor: `color-mix(in srgb, ${alert.color} 10%, var(--bg-surface))`,
            borderColor: `color-mix(in srgb, ${alert.color} 30%, transparent)`
          }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${alert.color} 14%, transparent)` }}>
            {alert.icon === 'warning' && <AlertTriangle className="w-3.5 h-3.5" style={{ color: alert.color }} />}
            {alert.icon === 'imbalance' && <Scale className="w-3.5 h-3.5" style={{ color: alert.color }} />}
            {alert.icon === 'pr' && <Trophy className="w-3.5 h-3.5" style={{ color: alert.color }} />}
          </span>
          <div className="text-[11px] flex-1 truncate font-medium" style={{ color: alert.color }}>
            {alert.text}
          </div>
        </motion.div>
      </AnimatePresence>
    ) : null,
    today_card: (
      <div key="today_card" className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 animate-card-enter" style={{ animationDelay: '300ms' }}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[10px] uppercase tracking-[0.8px] text-[var(--text-secondary)] font-semibold">TODAY'S ACTIVITIES</h3>
          <span className="text-[10px] text-[var(--text-secondary)]">{format(new Date(), 'MMM d')}</span>
        </div>

        {todaysWorkout ? (
          <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--green)] shadow-[0_0_8px_var(--green)]"></div>
              <div>
                <h4 className="text-[13px] font-medium text-[var(--text-primary)]">{todaysWorkout.title || 'Workout'}</h4>
                <p className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1.5">
                  <span>{todaysWorkout.duration_minutes || 0} min</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-[#cdd6e1]"></span>
                  {(() => {
                    const exList: any[] = Array.isArray(todaysWorkout.exercises) ? todaysWorkout.exercises : [];
                    const runEx = exList.find((ex: any) => ex.unit === 'km' || ex.unit === 'mi');
                    if (runEx) {
                      return <span>{Number(runEx.weight || 0).toFixed(2)} {runEx.unit}</span>;
                    }
                    const vol = exList.reduce((sum: number, ex: any) => sum + (toDisplayExerciseWeight(ex) * (ex.reps || 0) * (ex.sets || 0)), 0);
                    return <span>{vol.toLocaleString()} {displayUnit}</span>;
                  })()}
                </p>
              </div>
            </div>
            <button onClick={() => navigate('/timeline')} className="p-1.5 text-[var(--accent)] hover:bg-[var(--accent-dim)] rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] border-dashed">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[var(--text-muted)]"></div>
              <div>
                <h4 className="text-[13px] font-medium text-[var(--text-primary)]">Rest Day</h4>
                <p className="text-[10px] text-[var(--text-secondary)]">No activity logged</p>
              </div>
            </div>
            <button
              onClick={handleWorkoutEntry}
              className="px-3 py-1 bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-medium rounded-lg border border-[var(--accent)]/30 hover:bg-[var(--accent)] hover:text-black transition-colors"
            >
              Log
            </button>
          </div>
        )}
      </div>
    ),
    week_strip: (
      <div key="week_strip" className="flex flex-col gap-2">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-3 animate-card-enter" style={{ animationDelay: '270ms' }}>
          <MuscleRadar muscleData={muscleData} />
        </div>
      </div>
    ),
    ai_summary: (
        <div key="ai_summary" className="bg-[var(--bg-surface)] border border-[var(--purple)]/25 rounded-xl p-3 animate-card-enter" style={{ animationDelay: '360ms' }}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[11px] text-[var(--purple)] font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Weekly AI Summary</h3>
          {new Date().getDay() === 0 && (
            <button className="text-[9px] px-2 py-0.5 rounded-lg bg-[var(--purple)]/10 text-[var(--purple)] border border-[var(--purple)]/30 hover:bg-[var(--purple)]/20 transition-colors">
              Generate
            </button>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] leading-[1.6]">
          {trainedMuscleGroups.length > 0 
            ? `You hit ${trainedMuscleGroups.join(', ')} this week. Consistency is key. Keep pushing your limits and ensure adequate recovery for optimal growth.`
            : `You haven't logged any workouts this week. Start a session to generate insights.`}
        </p>
      </div>
    ),
    whoop_row: <WhoopDashboard key="whoop_row" />
  };

  const renderWidgets = () => {
    const rendered = [];
    for (let i = 0; i < visibleWidgets.length; i++) {
      const id = visibleWidgets[i];
      const nextId = visibleWidgets[i + 1];
      const isHalf = id === 'muscle_map' || id === 'train_next';
      const nextIsHalf = nextId === 'muscle_map' || nextId === 'train_next';
      
      if (isHalf && nextIsHalf) {
        rendered.push(
          <div key={`${id}-${nextId}`} className="grid grid-cols-2 gap-2 animate-card-enter" style={{ animationDelay: '120ms' }}>
            {WIDGET_COMPONENTS[id]}
            {WIDGET_COMPONENTS[nextId]}
          </div>
        );
        i++; // Skip next
      } else {
        rendered.push(
          <React.Fragment key={id}>
            {WIDGET_COMPONENTS[id]}
          </React.Fragment>
        );
      }
    }
    return rendered;
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] pb-24 md:pb-0 font-sans">
      <div className="max-w-[480px] mx-auto pb-6 flex flex-col gap-2">
        {renderWidgets()}
      </div>

      {showGoalEdit && (
        <GoalEditSheet
          current={goalDays}
          onClose={() => setShowGoalEdit(false)}
          onConfirm={(days) => {
            setGoalDays(days);
            localStorage.setItem('athlix:weekly_goal_days', String(days));
            setShowGoalEdit(false);
          }}
        />
      )}
    </div>
  );
};

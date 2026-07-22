import { useState, useEffect, useRef, useCallback } from 'react';
import { useGPS } from './useGPS';
import { calculateDistance, calculatePace, GpsKalmanFilter } from '../utils/gpsCalculations';
import type { GpsPoint } from '../utils/gpsCalculations';

const MIN_MOVEMENT_METERS = 3;
const MAX_GPS_ACCURACY_METERS = 65;
const MAX_RUNNING_SPEED_MPS = 12;
const PATH_UI_SYNC_INTERVAL_MS = 1200;

export interface RunSummary {
  path: GpsPoint[];
  distance: number;
  duration: number;
  pace: number;
  timestamp: number;
  splits: { km: number; pace: number }[];
}

interface UseRunTrackingReturn {
  isRunning: boolean;
  isPaused: boolean;
  path: GpsPoint[];
  currentPosition: GpsPoint | null;
  totalDistance: number;
  elapsedTime: number;
  pace: number;
  splits: { km: number; pace: number }[];
  error: string | null;
  errorCode: number | null;
  startRun: () => void;
  pauseRun: () => void;
  resumeRun: () => void;
  stopRun: () => RunSummary;
}

export const useRunTracking = (): UseRunTrackingReturn => {
  const { position, error, errorCode, startTracking, stopTracking } = useGPS();
  const [path, setPath] = useState<GpsPoint[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [splits, setSplits] = useState<{ km: number; pace: number }[]>([]);

  const timerRef = useRef<number | null>(null);
  const pathRef = useRef<GpsPoint[]>([]);
  const distanceRef = useRef(0);
  const skipNextDeltaRef = useRef(false);
  const lastPathSyncAtRef = useRef(0);
  const kalmanRef = useRef(new GpsKalmanFilter());

  // Mirror elapsed time in a ref so position effect can read current value without stale closure
  const elapsedTimeRef = useRef(0);

  // Splits tracking refs
  const splitsRef = useRef<{ km: number; pace: number }[]>([]);
  const nextSplitKmRef = useRef(1.0);
  const splitStartTimeRef = useRef(0);
  const splitStartDistRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      setElapsedTime((prev) => {
        const next = prev + 1000;
        elapsedTimeRef.current = next;
        return next;
      });
    }, 1000);
  };

  const startRun = useCallback(() => {
    const started = startTracking();
    if (!started) {
      setIsRunning(false);
      setIsPaused(false);
      return;
    }

    pathRef.current = [];
    distanceRef.current = 0;
    skipNextDeltaRef.current = false;
    lastPathSyncAtRef.current = 0;
    kalmanRef.current.reset();

    // Reset splits
    splitsRef.current = [];
    nextSplitKmRef.current = 1.0;
    splitStartTimeRef.current = 0;
    splitStartDistRef.current = 0;
    elapsedTimeRef.current = 0;

    setPath([]);
    setTotalDistance(0);
    setElapsedTime(0);
    setSplits([]);
    setIsRunning(true);
    setIsPaused(false);
    startTimer();
  }, [startTracking]);

  const pauseRun = useCallback(() => {
    setIsPaused(true);
    clearTimer();
  }, []);

  const resumeRun = useCallback(() => {
    setIsPaused(false);
    skipNextDeltaRef.current = true;
    startTimer();
  }, []);

  const stopRun = useCallback((): RunSummary => {
    clearTimer();
    stopTracking();
    setIsRunning(false);
    setIsPaused(false);
    const summary: RunSummary = {
      path: pathRef.current,
      distance: distanceRef.current,
      duration: elapsedTimeRef.current,
      pace: calculatePace(distanceRef.current, elapsedTimeRef.current),
      timestamp: Date.now(),
      splits: splitsRef.current,
    };
    return summary;
  }, [stopTracking]);

  // Track new GPS position → append to path
  useEffect(() => {
    if (!position || !isRunning || isPaused) return;

    if (typeof position.accuracy === 'number' && position.accuracy > MAX_GPS_ACCURACY_METERS) {
      return;
    }

    // Smooth the raw GPS reading before any distance/speed checks.
    const smoothed = kalmanRef.current.filter(position);
    const last = pathRef.current[pathRef.current.length - 1];
    if (last) {
      if (skipNextDeltaRef.current) {
        skipNextDeltaRef.current = false;
      } else {
        const delta = calculateDistance(last, smoothed);

        const deltaMeters = delta * 1000;
        // Ignore jitter under 3 m
        if (deltaMeters < MIN_MOVEMENT_METERS) return;

        if (typeof last.timestamp === 'number' && typeof smoothed.timestamp === 'number') {
          const deltaSeconds = (smoothed.timestamp - last.timestamp) / 1000;
          if (deltaSeconds > 0) {
            const speed = deltaMeters / deltaSeconds;
            // Ignore unrealistic spikes caused by GPS jumps.
            if (speed > MAX_RUNNING_SPEED_MPS) return;
          }
        }

        distanceRef.current += delta;
        setTotalDistance(distanceRef.current);

        // Check for km splits
        while (distanceRef.current >= nextSplitKmRef.current) {
          const splitDuration = elapsedTimeRef.current - splitStartTimeRef.current;
          const splitDist = nextSplitKmRef.current - splitStartDistRef.current;
          const splitPace = calculatePace(splitDist, splitDuration);
          const newSplit = { km: nextSplitKmRef.current, pace: splitPace };
          splitsRef.current = [...splitsRef.current, newSplit];
          setSplits([...splitsRef.current]);

          splitStartTimeRef.current = elapsedTimeRef.current;
          splitStartDistRef.current = nextSplitKmRef.current;
          nextSplitKmRef.current += 1.0;
        }
      }
    }

    pathRef.current.push(smoothed);
    const now = smoothed.timestamp ?? Date.now();
    if (
      pathRef.current.length <= 2
      || now - lastPathSyncAtRef.current >= PATH_UI_SYNC_INTERVAL_MS
    ) {
      lastPathSyncAtRef.current = now;
      setPath([...pathRef.current]);
    }
  }, [position, isRunning, isPaused]);

  // If tracking cannot begin due permission denial, end the run gracefully.
  useEffect(() => {
    if (!isRunning || isPaused) return;
    if (pathRef.current.length > 0) return;
    if (!errorCode || errorCode !== 1) return;

    clearTimer();
    stopTracking();
    setIsRunning(false);
    setIsPaused(false);
  }, [errorCode, isPaused, isRunning, stopTracking]);

  useEffect(() => () => { clearTimer(); stopTracking(); }, []);

  return {
    isRunning,
    isPaused,
    path,
    currentPosition: position,
    totalDistance,
    elapsedTime,
    pace: totalDistance > 0 ? calculatePace(totalDistance, elapsedTime) : 0,
    splits,
    error,
    errorCode,
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
  };
};

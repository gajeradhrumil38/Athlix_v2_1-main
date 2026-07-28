import { useState, useEffect, useRef, useCallback } from 'react';
import { useGPS } from './useGPS';
import { calculateDistance, calculatePace, GpsKalmanFilter } from '../utils/gpsCalculations';
import type { GpsPoint } from '../utils/gpsCalculations';

const MIN_MOVEMENT_METERS = 3;
const MAX_GPS_ACCURACY_METERS = 65;
const MAX_RUNNING_SPEED_MPS = 12;
const PATH_UI_SYNC_INTERVAL_MS = 1200;
// No net horizontal movement for this long -> auto-pause (red light, water
// stop). Long enough that normal running cadence / brief GPS gaps never
// trigger it by accident.
const AUTO_PAUSE_STATIONARY_MS = 15_000;
// Raw GPS altitude is far noisier than horizontal position (+-10-30m is
// common) — a delta below this is treated as noise, not real elevation
// change, the same way MIN_MOVEMENT_METERS filters horizontal jitter.
const MIN_ELEVATION_DELTA_METERS = 2;

export interface RunSummary {
  path: GpsPoint[];
  distance: number;
  duration: number;
  pace: number;
  timestamp: number;
  splits: { km: number; pace: number }[];
  elevationGain: number;
}

interface UseRunTrackingReturn {
  isRunning: boolean;
  isPaused: boolean;
  isAutoPaused: boolean;
  path: GpsPoint[];
  currentPosition: GpsPoint | null;
  totalDistance: number;
  elapsedTime: number;
  pace: number;
  splits: { km: number; pace: number }[];
  elevationGain: number;
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
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [splits, setSplits] = useState<{ km: number; pace: number }[]>([]);
  const [elevationGain, setElevationGain] = useState(0);

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

  // Elevation tracking
  const elevationGainRef = useRef(0);
  const lastAltitudeRef = useRef<number | null>(null);

  // Auto-pause: lastMovementAtRef is updated on every GPS-confirmed real
  // movement; if too much time passes without one, autoPause() fires.
  // autoPausedRef distinguishes "paused because the runner stopped moving"
  // from a manual tap, since only the former should watch for movement to
  // resume itself.
  const lastMovementAtRef = useRef(Date.now());
  const autoPausedRef = useRef(false);
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

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
      // Backup stationary check: GPS updates can stop arriving entirely
      // while stationary on some devices (throttled watchPosition), which
      // would leave the position effect below never re-running to notice.
      // This tick runs regardless of new GPS data.
      if (
        isRunningRef.current && !isPausedRef.current
        && Date.now() - lastMovementAtRef.current >= AUTO_PAUSE_STATIONARY_MS
      ) {
        autoPausedRef.current = true;
        setIsAutoPaused(true);
        setIsPaused(true);
        clearTimer();
      }
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

    // Reset elevation
    elevationGainRef.current = 0;
    lastAltitudeRef.current = null;

    // Reset auto-pause tracking
    lastMovementAtRef.current = Date.now();
    autoPausedRef.current = false;

    setPath([]);
    setTotalDistance(0);
    setElapsedTime(0);
    setSplits([]);
    setElevationGain(0);
    setIsAutoPaused(false);
    setIsRunning(true);
    setIsPaused(false);
    startTimer();
  }, [startTracking]);

  const pauseRun = useCallback(() => {
    autoPausedRef.current = false;
    setIsAutoPaused(false);
    setIsPaused(true);
    clearTimer();
  }, []);

  const resumeRun = useCallback(() => {
    autoPausedRef.current = false;
    setIsAutoPaused(false);
    lastMovementAtRef.current = Date.now();
    setIsPaused(false);
    skipNextDeltaRef.current = true;
    startTimer();
  }, []);

  const stopRun = useCallback((): RunSummary => {
    clearTimer();
    stopTracking();
    setIsRunning(false);
    setIsPaused(false);
    setIsAutoPaused(false);
    const summary: RunSummary = {
      path: pathRef.current,
      distance: distanceRef.current,
      duration: elapsedTimeRef.current,
      pace: calculatePace(distanceRef.current, elapsedTimeRef.current),
      timestamp: Date.now(),
      splits: splitsRef.current,
      elevationGain: elevationGainRef.current,
    };
    return summary;
  }, [stopTracking]);

  // Track new GPS position → append to path
  useEffect(() => {
    if (!position || !isRunning) return;

    // Manually paused: ignore GPS entirely, same as before. Auto-paused is
    // different — keep watching raw deltas (without accumulating distance)
    // so movement resuming can un-pause itself.
    if (isPaused && !autoPausedRef.current) return;

    if (typeof position.accuracy === 'number' && position.accuracy > MAX_GPS_ACCURACY_METERS) {
      return;
    }

    // Smooth the raw GPS reading before any distance/speed checks.
    const smoothed = kalmanRef.current.filter(position);
    const last = pathRef.current[pathRef.current.length - 1];

    if (isPaused && autoPausedRef.current) {
      if (last) {
        const resumeDeltaMeters = calculateDistance(last, smoothed) * 1000;
        if (resumeDeltaMeters >= MIN_MOVEMENT_METERS) {
          resumeRun();
        }
      }
      return;
    }

    if (last) {
      if (skipNextDeltaRef.current) {
        skipNextDeltaRef.current = false;
      } else {
        const delta = calculateDistance(last, smoothed);

        const deltaMeters = delta * 1000;
        // Ignore jitter under 3 m
        if (deltaMeters < MIN_MOVEMENT_METERS) {
          // No real movement this tick — check whether it's been stationary
          // long enough to auto-pause. Uses the GPS point's own timestamp
          // (not wall-clock) so it stays accurate even if this callback is
          // delayed; startTimer()'s interval is the wall-clock backup for
          // when GPS updates stop arriving altogether.
          const now = smoothed.timestamp ?? Date.now();
          if (now - lastMovementAtRef.current >= AUTO_PAUSE_STATIONARY_MS) {
            autoPausedRef.current = true;
            setIsAutoPaused(true);
            setIsPaused(true);
            clearTimer();
          }
          return;
        }

        lastMovementAtRef.current = smoothed.timestamp ?? Date.now();

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

        // Elevation gain — only count smoothed altitude increases past the
        // noise floor, and only ever accumulate gain (not loss), matching
        // how every mainstream running app reports this stat.
        if (typeof smoothed.altitude === 'number') {
          const lastAltitude = lastAltitudeRef.current;
          if (lastAltitude !== null) {
            const altDelta = smoothed.altitude - lastAltitude;
            if (altDelta >= MIN_ELEVATION_DELTA_METERS) {
              elevationGainRef.current += altDelta;
              setElevationGain(elevationGainRef.current);
              lastAltitudeRef.current = smoothed.altitude;
            } else if (altDelta <= -MIN_ELEVATION_DELTA_METERS) {
              lastAltitudeRef.current = smoothed.altitude;
            }
            // else: within the noise floor — keep the old reference point
            // rather than drifting on every tiny fluctuation.
          } else {
            lastAltitudeRef.current = smoothed.altitude;
          }
        }

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
  }, [position, isRunning, isPaused, resumeRun]);

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
    isAutoPaused,
    path,
    currentPosition: position,
    totalDistance,
    elapsedTime,
    pace: totalDistance > 0 ? calculatePace(totalDistance, elapsedTime) : 0,
    splits,
    elevationGain,
    error,
    errorCode,
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
  };
};

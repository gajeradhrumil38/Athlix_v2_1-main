import { useState, useEffect, useRef, useCallback } from 'react';
import { calculateDistance } from '../utils/gpsCalculations';
import type { GpsPoint } from '../utils/gpsCalculations';

interface UseGPSReturn {
  position: GpsPoint | null;
  error: string | null;
  errorCode: number | null;
  tracking: boolean;
  startTracking: () => boolean;
  stopTracking: () => void;
}

export const useGPS = (): UseGPSReturn => {
  const [position, setPosition] = useState<GpsPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastPointRef = useRef<GpsPoint | null>(null);

  const startTracking = useCallback(() => {
    if (!window.isSecureContext) {
      setError('Location tracking requires HTTPS (or localhost).');
      setErrorCode(null);
      return false;
    }

    if (!navigator.geolocation) {
      setError('GPS not available on this device.');
      setErrorCode(null);
      return false;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setError(null);
    setErrorCode(null);
    lastPointRef.current = null;
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const nextPoint: GpsPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          };

          const lastPoint = lastPointRef.current;
          if (lastPoint) {
            const movedMeters = calculateDistance(lastPoint, nextPoint) * 1000;
            const elapsedMs = (nextPoint.timestamp ?? Date.now()) - (lastPoint.timestamp ?? 0);
            // Ignore dense duplicates to keep map rendering smoother.
            if (movedMeters < 2 && elapsedMs < 1000) return;
          }

          lastPointRef.current = nextPoint;
          setPosition(nextPoint);
          setError(null);
          setErrorCode(null);
          setTracking(true);
        },
        (err) => {
          setError(err.message);
          setErrorCode(err.code);
          setTracking(false);
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 },
      );
    } catch (watchError: any) {
      setError(watchError?.message || 'Failed to start GPS tracking.');
      setErrorCode(null);
      setTracking(false);
      return false;
    }
    return true;
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastPointRef.current = null;
    setTracking(false);
  }, []);

  useEffect(() => () => stopTracking(), [stopTracking]);

  return { position, error, errorCode, tracking, startTracking, stopTracking };
};

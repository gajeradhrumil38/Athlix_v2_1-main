import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  appendHeartRateSamples,
  endHeartRateSession,
  getHeartRateSamples,
  getLatestHeartRateSession,
  startHeartRateSession,
} from '../lib/supabaseData';

export interface HeartRateSample {
  ts: number;
  bpm: number;
}

interface HeartRateContextType {
  supportsWebBluetooth: boolean;
  hrConnecting: boolean;
  hrConnected: boolean;
  hrError: string | null;
  hrDeviceName: string;
  hrSamples: HeartRateSample[];
  connectHeartRate: () => Promise<void>;
  disconnectHeartRate: () => Promise<void>;
  clearHrError: () => void;
}

type BluetoothRequestOptions = {
  filters: Array<{ services: string[] }>;
  optionalServices?: string[];
} | {
  acceptAllDevices: true;
  optionalServices: string[];
};

type WebBluetoothClient = {
  requestDevice: (options: BluetoothRequestOptions) => Promise<WebBluetoothDevice>;
};

type WebBluetoothServer = {
  getPrimaryService: (service: string) => Promise<WebBluetoothService>;
  connected?: boolean;
  disconnect?: () => void;
};

type WebBluetoothService = {
  getCharacteristic: (characteristic: string) => Promise<WebBluetoothCharacteristic>;
};

type WebBluetoothDevice = EventTarget & {
  name?: string;
  gatt?: {
    connect: () => Promise<WebBluetoothServer>;
    connected?: boolean;
    disconnect: () => void;
  };
};

type WebBluetoothCharacteristic = EventTarget & {
  value: DataView | null;
  startNotifications: () => Promise<WebBluetoothCharacteristic>;
  stopNotifications: () => Promise<void>;
};

const HeartRateContext = createContext<HeartRateContextType>({
  supportsWebBluetooth: false,
  hrConnecting: false,
  hrConnected: false,
  hrError: null,
  hrDeviceName: '',
  hrSamples: [],
  connectHeartRate: async () => {},
  disconnectHeartRate: async () => {},
  clearHrError: () => {},
});

const MAX_IN_MEMORY_SAMPLES = 3600;
const FLUSH_INTERVAL_MS = 4000;
const EARLY_FLUSH_THRESHOLD = 16;

const parseHeartRateMeasurement = (dataView: DataView) => {
  if (!dataView || dataView.byteLength < 2) return null;
  const flags = dataView.getUint8(0);
  const is16Bit = (flags & 0x01) === 1;
  const bpm = is16Bit ? dataView.getUint16(1, true) : dataView.getUint8(1);
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  return Math.round(bpm);
};

const isIOSBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(ua) || touchMac;
};

const getUnsupportedBluetoothMessage = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Web Bluetooth is unavailable on this platform.';
  }

  if (!window.isSecureContext) {
    return 'Bluetooth pairing requires HTTPS. Open Athlix(TM) on a secure URL.';
  }

  if (isIOSBrowser()) {
    return 'iOS browsers currently limit direct Bluetooth pairing. Use Athlix(TM) on Android Chrome or desktop Chrome/Edge.';
  }

  return 'Web Bluetooth is not available in this browser. Use a compatible Chrome/Edge browser.';
};

export const HeartRateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [hrConnecting, setHrConnecting] = useState(false);
  const [hrConnected, setHrConnected] = useState(false);
  const [hrError, setHrError] = useState<string | null>(null);
  const [hrDeviceName, setHrDeviceName] = useState('');
  const [hrSamples, setHrSamples] = useState<HeartRateSample[]>([]);

  const hrDeviceRef = useRef<WebBluetoothDevice | null>(null);
  const hrCharRef = useRef<WebBluetoothCharacteristic | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingSamplesRef = useRef<HeartRateSample[]>([]);
  const flushInFlightRef = useRef(false);
  const gattDisconnectedHandlerRef = useRef<((event: Event) => void) | null>(null);

  const supportsWebBluetooth = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'bluetooth' in navigator &&
      window.isSecureContext &&
      !isIOSBrowser(),
    [],
  );

  const flushPendingSamples = useCallback(async () => {
    if (!user || !sessionIdRef.current || pendingSamplesRef.current.length === 0) return;
    if (flushInFlightRef.current) return;

    const toFlush = pendingSamplesRef.current.splice(0, pendingSamplesRef.current.length);
    if (!toFlush.length) return;

    flushInFlightRef.current = true;
    try {
      await appendHeartRateSamples(user.id, sessionIdRef.current, toFlush);
    } catch (error) {
      pendingSamplesRef.current = [...toFlush, ...pendingSamplesRef.current];
      console.warn('Failed to persist heart-rate samples:', error);
    } finally {
      flushInFlightRef.current = false;
    }
  }, [user]);

  const handleHeartRateNotification = useCallback(
    (event: Event) => {
      const target = event.target as WebBluetoothCharacteristic | null;
      if (!target?.value) return;
      const bpm = parseHeartRateMeasurement(target.value);
      if (!bpm) return;

      const sample = { ts: Date.now(), bpm };
      setHrSamples((prev) => [...prev, sample].slice(-MAX_IN_MEMORY_SAMPLES));
      pendingSamplesRef.current.push(sample);

      if (pendingSamplesRef.current.length >= EARLY_FLUSH_THRESHOLD) {
        void flushPendingSamples();
      }
    },
    [flushPendingSamples],
  );

  const clearHrError = useCallback(() => {
    setHrError(null);
  }, []);

  const disconnectHeartRate = useCallback(async () => {
    try {
      await flushPendingSamples();
    } catch {
      // ignore flush failures during disconnect
    }

    if (user && sessionIdRef.current) {
      try {
        await endHeartRateSession(user.id, sessionIdRef.current);
      } catch (error) {
        console.warn('Failed to end heart-rate session:', error);
      }
    }

    try {
      if (hrCharRef.current) {
        hrCharRef.current.removeEventListener(
          'characteristicvaluechanged',
          handleHeartRateNotification as EventListener,
        );
      }
    } catch {
      // ignore listener cleanup issues
    }

    try {
      if (hrDeviceRef.current && gattDisconnectedHandlerRef.current) {
        hrDeviceRef.current.removeEventListener(
          'gattserverdisconnected',
          gattDisconnectedHandlerRef.current as EventListener,
        );
      }
    } catch {
      // ignore listener cleanup issues
    }

    try {
      await hrCharRef.current?.stopNotifications();
    } catch {
      // ignore stop notification issues
    }

    try {
      if (hrDeviceRef.current?.gatt?.connected) {
        hrDeviceRef.current.gatt.disconnect();
      }
    } catch {
      // ignore disconnect issues
    }

    hrCharRef.current = null;
    hrDeviceRef.current = null;
    gattDisconnectedHandlerRef.current = null;
    sessionIdRef.current = null;
    pendingSamplesRef.current = [];

    setHrConnected(false);
    setHrConnecting(false);
    setHrDeviceName('');
  }, [flushPendingSamples, handleHeartRateNotification, user]);

  const connectHeartRate = useCallback(async () => {
    if (!user) {
      setHrError('Sign in to connect a heart-rate device.');
      return;
    }

    if (!supportsWebBluetooth) {
      setHrError(getUnsupportedBluetoothMessage());
      return;
    }

    if (hrConnecting) return;

    setHrConnecting(true);
    setHrError(null);

    try {
      const bluetoothClient = (navigator as Navigator & { bluetooth?: WebBluetoothClient }).bluetooth;
      if (!bluetoothClient) {
        throw new Error('Web Bluetooth is unavailable in this browser.');
      }

      let device: WebBluetoothDevice;

      try {
        device = await bluetoothClient.requestDevice({
          filters: [{ services: ['heart_rate'] }],
          optionalServices: ['battery_service'],
        });
      } catch (requestError: any) {
        if (requestError?.name !== 'NotFoundError') {
          throw requestError;
        }

        // Fallback picker to handle devices that do not advertise the standard service
        // until after pairing.
        device = await bluetoothClient.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['heart_rate', 'battery_service'],
        });
      }

      const server = await device.gatt?.connect();
      if (!server) throw new Error('Could not connect to device.');

      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      await characteristic.startNotifications();
      characteristic.addEventListener(
        'characteristicvaluechanged',
        handleHeartRateNotification as EventListener,
      );

      const onDisconnected = () => {
        setHrConnected(false);
        void flushPendingSamples();
        if (user && sessionIdRef.current) {
          void endHeartRateSession(user.id, sessionIdRef.current);
        }
        hrCharRef.current = null;
        hrDeviceRef.current = null;
        gattDisconnectedHandlerRef.current = null;
        sessionIdRef.current = null;
      };
      device.addEventListener('gattserverdisconnected', onDisconnected as EventListener);

      const session = await startHeartRateSession(user.id, device.name || 'Heart Rate Device');
      sessionIdRef.current = session.id;

      hrDeviceRef.current = device;
      hrCharRef.current = characteristic;
      gattDisconnectedHandlerRef.current = onDisconnected;

      setHrDeviceName(device.name || 'Heart Rate Device');
      setHrConnected(true);

      const warmupSamples = await getHeartRateSamples(user.id, {
        sessionId: session.id,
        limit: MAX_IN_MEMORY_SAMPLES,
      });
      if (warmupSamples.length > 0) {
        setHrSamples(
          warmupSamples.map((sample) => ({
            ts: sample.ts,
            bpm: sample.bpm,
          })),
        );
      }
    } catch (error: any) {
      if (error?.name === 'NotFoundError') {
        setHrError('No device selected. Ensure your wearable is in heart-rate broadcast mode and retry.');
      } else if (error?.name === 'NotSupportedError') {
        setHrError(getUnsupportedBluetoothMessage());
      } else {
        setHrError(error?.message || 'Failed to connect heart-rate device.');
      }
      setHrConnected(false);
    } finally {
      setHrConnecting(false);
    }
  }, [flushPendingSamples, handleHeartRateNotification, hrConnecting, supportsWebBluetooth, user]);

  useEffect(() => {
    if (!user) return;
    const intervalId = window.setInterval(() => {
      void flushPendingSamples();
    }, FLUSH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [flushPendingSamples, user]);

  useEffect(() => {
    if (!user) {
      setHrSamples([]);
      pendingSamplesRef.current = [];
      if (hrDeviceRef.current || hrCharRef.current || sessionIdRef.current) {
        void disconnectHeartRate();
      }
      return;
    }

    const loadLatestSamples = async () => {
      try {
        const latestSession = await getLatestHeartRateSession(user.id);
        if (!latestSession) {
          setHrSamples([]);
          return;
        }

        const samples = await getHeartRateSamples(user.id, {
          sessionId: latestSession.id,
          limit: MAX_IN_MEMORY_SAMPLES,
        });
        setHrSamples(samples.map((sample) => ({ ts: sample.ts, bpm: sample.bpm })));
      } catch (error) {
        console.warn('Failed to load latest heart-rate samples:', error);
      }
    };

    void loadLatestSamples();
  }, [disconnectHeartRate, user]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      void flushPendingSamples();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void flushPendingSamples();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushPendingSamples]);

  useEffect(() => {
    return () => {
      void disconnectHeartRate();
    };
  }, [disconnectHeartRate]);

  return (
    <HeartRateContext.Provider
      value={{
        supportsWebBluetooth,
        hrConnecting,
        hrConnected,
        hrError,
        hrDeviceName,
        hrSamples,
        connectHeartRate,
        disconnectHeartRate,
        clearHrError,
      }}
    >
      {children}
    </HeartRateContext.Provider>
  );
};

export const useHeartRate = () => useContext(HeartRateContext);

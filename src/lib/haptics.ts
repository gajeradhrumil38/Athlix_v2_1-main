const canUseNavigator = typeof navigator !== 'undefined';

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }
  return audioContext;
};

const runSilentPulse = (durationMs: number) => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 180;
    gain.gain.value = 0.00001;

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const start = ctx.currentTime;
    const stop = start + durationMs / 1000;

    oscillator.start(start);
    oscillator.stop(stop);
  } catch {
    // Ignore unsupported audio/haptic runtime behavior.
  }
};

const vibrate = (pattern: number | number[]) => {
  if (!canUseNavigator) return;

  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
      return;
    } catch {
      // Fallback below.
    }
  }

  const totalMs = Array.isArray(pattern) ? pattern.reduce((sum, part) => sum + part, 0) : pattern;
  runSilentPulse(Math.max(8, totalMs));
};

export const haptics = {
  tick: () => {
    vibrate(8);
  },

  success: () => {
    vibrate([15, 5, 15]);
  },

  complete: () => {
    vibrate([30, 10, 30, 10, 60]);
  },

  error: () => {
    vibrate([10, 5, 10, 5, 10]);
  },
};

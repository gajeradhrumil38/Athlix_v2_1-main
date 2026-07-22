import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Upload, Zap, ZapOff, RotateCcw, X } from 'lucide-react';
import type { ScanState, ScanStep } from '../types';
import {
  compressImage,
  makeThumbnail,
  uploadFoodImage,
  recognizeFoodWithGemini,
  calcTotals,
} from '../services/foodRecognition.service';
import { useAuth } from '../../../contexts/AuthContext';

// ─── Health quotes shown while scanning ──────────────────────────────────────

const HEALTH_QUOTES: { quote: string; tag: string }[] = [
  { quote: 'Protein synthesis peaks 2–3 hours after resistance training.', tag: 'EXERCISE SCIENCE' },
  { quote: 'A colourful plate naturally diversifies your gut microbiome.', tag: 'NUTRITION' },
  { quote: 'Eating slowly can reduce calorie intake by up to 20%.', tag: 'MINDFUL EATING' },
  { quote: 'Your muscles are ~70% water — hydration directly affects strength.', tag: 'HYDRATION' },
  { quote: 'Fibre feeds the 38 trillion bacteria that keep your gut in balance.', tag: 'GUT HEALTH' },
  { quote: 'Sleep is the most potent anabolic stimulus money cannot buy.', tag: 'RECOVERY' },
  { quote: 'Omega-3s reduce delayed-onset muscle soreness by up to 35%.', tag: 'RECOVERY' },
  { quote: 'The Mediterranean diet reduces cardiovascular risk by around 30%.', tag: 'LONGEVITY' },
  { quote: 'Creatine is the most researched and proven performance supplement.', tag: 'SUPPLEMENTS' },
  { quote: 'Nitrates in leafy greens improve mitochondrial efficiency during exercise.', tag: 'PERFORMANCE' },
  { quote: 'Eating protein at breakfast significantly reduces total daily hunger.', tag: 'SATIETY' },
  { quote: 'Your gut microbiome influences mood, energy, and cognitive function.', tag: 'GUT–BRAIN AXIS' },
  { quote: 'Magnesium is involved in 300+ enzymatic reactions, including sleep regulation.', tag: 'MICRONUTRIENTS' },
  { quote: 'Post-workout carbohydrates replenish muscle glycogen 2× faster than rest.', tag: 'RECOVERY' },
  { quote: 'Zone 2 cardio is the most efficient way to build mitochondrial density.', tag: 'ENDURANCE' },
  { quote: 'Leucine is the amino acid that most potently triggers muscle protein synthesis.', tag: 'PROTEIN' },
  { quote: 'Resistance training improves insulin sensitivity for up to 24 hours.', tag: 'METABOLIC HEALTH' },
  { quote: 'Consistent meal timing trains your gut clock for better digestion.', tag: 'CHRONO-NUTRITION' },
  { quote: 'Polyphenols in dark berries increase blood flow to working muscles.', tag: 'PERFORMANCE' },
  { quote: 'Vitamin D deficiency affects 40% of adults and impairs recovery.', tag: 'MICRONUTRIENTS' },
  { quote: 'Whole foods contain thousands of phytochemicals science has not fully mapped.', tag: 'WHOLE FOODS' },
  { quote: 'Sprint intervals elevate growth hormone for up to 24 hours post-workout.', tag: 'HORMONES' },
  { quote: 'Every 10 g of protein per meal contributes meaningfully to muscle synthesis.', tag: 'PROTEIN' },
  { quote: 'The liver stores ~100 g of glycogen — the body\'s fastest available fuel.', tag: 'METABOLISM' },
  { quote: 'Cold exposure activates brown adipose tissue, boosting resting metabolic rate.', tag: 'METABOLISM' },
  { quote: 'Your meal timing can shift your circadian rhythm by up to 4 hours.', tag: 'CHRONO-NUTRITION' },
  { quote: 'Heat stress from saunas mirrors some cellular adaptations from aerobic exercise.', tag: 'RECOVERY' },
  { quote: 'Sodium benzoate forms benzene when combined with Vitamin C in acidic drinks.', tag: 'FOOD SAFETY' },
  { quote: 'Walking 10 min after a meal reduces post-meal blood glucose by up to 22%.', tag: 'BLOOD SUGAR' },
  { quote: 'Eating within a 10-hour window improves metabolic markers in most adults.', tag: 'TIME-RESTRICTED EATING' },
];

// ─── Processing view — replaces spinner with rotating quotes ─────────────────

const ORDERED_STEPS: ScanStep[] = ['uploading', 'recognizing', 'calculating'];
const STEP_LABEL: Partial<Record<ScanStep, string>> = {
  uploading:   'Saving image…',
  recognizing: 'Analysing food…',
  calculating: 'Building nutrition profile…',
};

const ProcessingView: React.FC<{ step: ScanStep }> = ({ step }) => {
  const [idx, setIdx]   = useState(() => Math.floor(Math.random() * HEALTH_QUOTES.length));
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => { setIdx((i) => (i + 1) % HEALTH_QUOTES.length); setFade(true); }, 380);
    }, 4800);
    return () => clearInterval(iv);
  }, []);

  const currentIdx   = ORDERED_STEPS.indexOf(step);
  const { quote, tag } = HEALTH_QUOTES[idx];

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 py-10">

      {/* Current step label */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C8FF00' }} />
        <p style={{ color: '#C8FF00', fontSize: 11, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          {STEP_LABEL[step] ?? 'Processing…'}
        </p>
      </div>

      {/* Divider */}
      <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.1)' }} />

      {/* Rotating quote */}
      <div style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.38s ease', minHeight: 110 }}
        className="flex flex-col items-center gap-3 text-center px-4">
        <p style={{ color: 'rgba(200,255,0,0.7)', fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          {tag}
        </p>
        <p style={{ color: '#fff', fontSize: 17, fontWeight: 700, lineHeight: 1.65, maxWidth: 300 }}>
          "{quote}"
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3">
        {ORDERED_STEPS.map((s, i) => {
          const done   = currentIdx > i;
          const active = currentIdx === i;
          return (
            <div key={s} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-2 h-2 rounded-full"
                  style={{ background: active ? '#C8FF00' : done ? 'rgba(200,255,0,0.45)' : 'rgba(255,255,255,0.15)', transition: 'background 0.3s' }} />
                <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: active ? '#C8FF00' : done ? 'rgba(200,255,0,0.45)' : 'rgba(255,255,255,0.25)' }}>
                  {s === 'uploading' ? 'Upload' : s === 'recognizing' ? 'Analyse' : 'Nutrition'}
                </span>
              </div>
              {i < 2 && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 16 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Step labels (kept for STEP_LABELS usage below if any)
const STEP_LABELS: Partial<Record<ScanStep, string>> = STEP_LABEL;

interface Props {
  onScanComplete: (state: ScanState) => void;
}

export const FoodScanner: React.FC<Props> = ({ onScanComplete }) => {
  const { user } = useAuth();

  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraActive, setCameraActive]   = useState(false);
  const [torchOn, setTorchOn]             = useState(false);
  const [torchAvail, setTorchAvail]       = useState(false);
  const [preview, setPreview]             = useState<string | null>(null);
  const [capturedFile, setCapturedFile]   = useState<File | null>(null);
  const [step, setStep]                   = useState<ScanStep>('idle');
  const [error, setError]                 = useState<string | null>(null);

  // ── Camera ──────────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      // Detect torch support
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as any;
      setTorchAvail(!!caps?.torch);
      // Show the viewfinder first — <video> is always in DOM so ref is valid immediately
      setCameraActive(true);
      // Attach stream; ref is guaranteed non-null since <video> is always rendered
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      setError('Camera access denied. Please allow camera permission or use gallery upload.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setTorchOn(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    await (track as any).applyConstraints({ advanced: [{ torch: next }] }).catch(() => {});
    setTorchOn(next);
  };

  // ── Capture from camera ─────────────────────────────────────────────────

  const captureFromCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Guard: video not playing yet (can happen on slow devices or before stream fully starts)
    if (!video.videoWidth || !video.videoHeight) {
      setError('Camera not ready yet — please wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError('Failed to capture image. Please try again or use gallery upload.');
        return;
      }
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopCamera();
      setPreview(URL.createObjectURL(file));
      setCapturedFile(file);
      setStep('previewing');
      setError(null);
    }, 'image/jpeg', 0.95);
  };

  // ── Gallery upload ───────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 50 MB raw — we compress to ≤300 KB before storage upload, so original size is not the bottleneck
    if (file.size > 50 * 1024 * 1024) {
      setError('Image too large (>50 MB). Please choose a smaller photo.');
      return;
    }
    stopCamera();
    setPreview(URL.createObjectURL(file));
    setCapturedFile(file);
    setStep('previewing');
    e.target.value = '';
  };

  // ── Scan processing ──────────────────────────────────────────────────────

  const runScan = async () => {
    if (!capturedFile || !user) return;
    setError(null);
    try {
      // 1. Compress + thumbnail
      setStep('uploading');
      const [compressed, thumb] = await Promise.all([
        compressImage(capturedFile),
        makeThumbnail(capturedFile),
      ]);

      // 2. Upload both to Supabase Storage
      const [imageUrl, thumbUrl] = await Promise.all([
        uploadFoodImage(user.id, compressed, ''),
        uploadFoodImage(user.id, thumb, '_thumb'),
      ]);

      // 3. Identify foods (dish) or extract nutrition label via Gemini Vision
      setStep('recognizing');
      const { foods, labelData } = await recognizeFoodWithGemini(capturedFile);

      // 4. Aggregate totals (0 for label scan — saved on confirm)
      setStep('calculating');
      const totals = calcTotals(foods);

      onScanComplete({
        step:             'done',
        imageFile:        capturedFile,
        imagePreviewUrl:  preview,
        uploadedImageUrl: imageUrl,
        uploadedThumbUrl: thumbUrl,
        foods,
        labelData,
        error:            null,
        ...totals,
      } as any);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan failed. Please try again.';
      setError(msg);
      setStep('previewing');
    }
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCapturedFile(null);
    setStep('idle');
    setError(null);
    // Re-entering idle clears any stale error from the previous attempt
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const isProcessing = step === 'uploading' || step === 'recognizing' || step === 'calculating';

  return (
    <div className="flex flex-col" style={{ minHeight: '100%' }}>

      {/* ── Preview mode ─────────────────────────────────────────────── */}
      {step === 'previewing' && preview ? (
        <div className="relative flex flex-col flex-1">
          <img src={preview} alt="Food preview" className="w-full object-cover"
            style={{ maxHeight: 360, borderRadius: 16, objectFit: 'cover' }} />

          {/* Reset button */}
          <button onClick={reset}
            className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}>
            <X className="w-4 h-4" style={{ color: '#fff' }} />
          </button>

          {error && (
            <div className="mt-3 px-4 py-3 rounded-2xl text-[13px] leading-snug"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>
              {error}
            </div>
          )}

          <button onClick={runScan} disabled={isProcessing}
            className="mt-4 w-full py-4 rounded-2xl text-[16px] font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60"
            style={{ background: '#C8FF00' }}>
            <Camera className="w-5 h-5" />
            Scan This Food
          </button>
          <button onClick={reset}
            className="mt-2 w-full py-3.5 rounded-2xl text-[14px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
            <RotateCcw className="w-4 h-4" /> Retake / Choose another
          </button>
        </div>

      /* ── Processing — rotating health quotes ──────────────────────── */
      ) : isProcessing ? (
        <ProcessingView step={step} />

      /* ── Idle / Camera ──────────────────────────────────────────────── */
      ) : (
        <div className="flex flex-col gap-4">

          {/* Camera viewfinder — fixed height avoids aspectRatio/minHeight conflict */}
          <div className="relative overflow-hidden rounded-2xl"
            style={{ background: '#0d0f13', height: 260 }}>

            {/* Video — always mounted, hidden when camera is off */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ display: cameraActive ? 'block' : 'none' }}
            />

            {/* Placeholder — shown when camera is inactive */}
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.15)' }}>
                  <Camera className="w-7 h-7" style={{ color: 'rgba(200,255,0,0.6)' }} />
                </div>
                <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Camera preview appears here
                </p>
              </div>
            )}

            {/* Overlays — only when camera is active */}
            {cameraActive && (
              <>
                {/* Corner brackets */}
                {(['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'] as const).map((pos, i) => (
                  <div key={i} className={`absolute ${pos} w-6 h-6`}
                    style={{
                      borderTop:    i < 2 ? '2px solid #C8FF00' : 'none',
                      borderBottom: i >= 2 ? '2px solid #C8FF00' : 'none',
                      borderLeft:   i % 2 === 0 ? '2px solid #C8FF00' : 'none',
                      borderRight:  i % 2 === 1 ? '2px solid #C8FF00' : 'none',
                      borderRadius: i === 0 ? '6px 0 0 0' : i === 1 ? '0 6px 0 0' : i === 2 ? '0 0 0 6px' : '0 0 6px 0',
                    }} />
                ))}
                {/* Torch toggle */}
                {torchAvail && (
                  <button onClick={toggleTorch}
                    className="absolute top-3 right-12 w-9 h-9 rounded-full flex items-center justify-center transition-all"
                    style={{ background: torchOn ? 'rgba(200,255,0,0.2)' : 'rgba(0,0,0,0.5)' }}>
                    {torchOn
                      ? <Zap className="w-4 h-4" style={{ color: '#C8FF00' }} />
                      : <ZapOff className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />}
                  </button>
                )}
                {/* Close camera */}
                <button onClick={stopCamera}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.5)' }}>
                  <X className="w-4 h-4" style={{ color: '#fff' }} />
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="px-4 py-3 rounded-2xl text-[13px] leading-snug"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}>
              {error}
            </div>
          )}

          {/* Action buttons */}
          {cameraActive ? (
            /* Shutter */
            <div className="flex justify-center mt-2">
              <button onClick={captureFromCamera}
                className="w-20 h-20 rounded-full flex items-center justify-center active:scale-90 transition-all"
                style={{ background: '#C8FF00', boxShadow: '0 0 0 4px rgba(200,255,0,0.2), 0 0 0 8px rgba(200,255,0,0.08)' }}>
                <Camera className="w-8 h-8" style={{ color: '#000' }} />
              </button>
            </div>
          ) : (
            <>
              <button onClick={startCamera}
                className="w-full py-4 rounded-2xl text-[16px] font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{ background: '#C8FF00' }}>
                <Camera className="w-5 h-5" /> Open Camera
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full py-4 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff' }}>
                <Upload className="w-5 h-5" /> Upload from Gallery
              </button>
            </>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={handleFileSelect} />

          {/* Hint */}
          <div className="text-center space-y-0.5">
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Point at your plate and tap capture.
            </p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Works best with good lighting and the food clearly visible.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

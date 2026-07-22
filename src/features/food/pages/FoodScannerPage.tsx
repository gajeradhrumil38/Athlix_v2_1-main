import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { FoodScanner } from '../components/FoodScanner';
import { FoodResults } from '../components/FoodResults';
import { LabelResults } from '../components/LabelResults';
import { RegionStandardSheet } from '../components/RegionStandardSheet';
import type { DetectedFood, ScanState } from '../types';
import { calcTotals } from '../services/foodRecognition.service';
import { saveFoodScan } from '../../../lib/foodData';
import { useAuth } from '../../../contexts/AuthContext';
import { useRegionStandard } from '../hooks/useRegionStandard';

const INITIAL_STATE: ScanState = {
  step:             'idle',
  imageFile:        null,
  imagePreviewUrl:  null,
  uploadedImageUrl: null,
  uploadedThumbUrl: null,
  foods:            [],
  labelData:        null,
  error:            null,
};

export const FoodScannerPage: React.FC = () => {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [state, setState]   = useState<ScanState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);

  // One-time region onboarding — fires only when the user has never chosen
  const { hasChosenRegion } = useRegionStandard();
  const [showRegionOnboarding, setShowRegionOnboarding] = useState(!hasChosenRegion);

  const handleScanComplete = (result: ScanState) => setState(result);

  const handleSave = async (foods: DetectedFood[]) => {
    if (!user) return;
    setSaving(true);
    try {
      const totals = calcTotals(foods);
      await saveFoodScan(user.id, {
        image_url:      state.uploadedImageUrl  ?? undefined,
        thumbnail_url:  state.uploadedThumbUrl  ?? undefined,
        foods_detected: foods,
        ...totals,
      });
      toast.success('Saved to history!');
      navigate('/food/history');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed. Please try again.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleScanAgain = () => {
    if (state.imagePreviewUrl) URL.revokeObjectURL(state.imagePreviewUrl);
    setState(INITIAL_STATE);
  };

  const isDone       = state.step === 'done';
  const isLabelScan  = isDone && state.labelData != null;
  const isDishScan   = isDone && state.labelData == null;

  const pageTitle = isLabelScan
    ? 'Nutrition Label'
    : isDishScan
    ? 'Scan Results'
    : 'Scan Your Meal';

  const pageSubtitle = !isDone
    ? 'Point at your plate to get instant calories & macros.'
    : undefined;

  return (
    <div className="px-4 py-5 space-y-5 max-w-[480px] mx-auto">

      {/* Header */}
      <div>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 4 }}>
          Food Scanner
        </p>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          {pageTitle}
        </h1>
        {pageSubtitle && (
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 4 }}>{pageSubtitle}</p>
        )}
      </div>

      <AnimatePresence mode="wait">
        {isLabelScan ? (
          <motion.div key="label"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.22 }}>
            <LabelResults
              label={state.labelData!}
              imagePreviewUrl={state.imagePreviewUrl}
              onSave={handleSave}
              onScanAgain={handleScanAgain}
              saving={saving}
            />
          </motion.div>

        ) : isDishScan ? (
          <motion.div key="results"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.22 }}>
            <FoodResults
              state={state}
              onSave={handleSave}
              onScanAgain={handleScanAgain}
              saving={saving}
            />
          </motion.div>

        ) : (
          <motion.div key="scanner"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.22 }}>
            <FoodScanner onScanComplete={handleScanComplete} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* One-time region onboarding popup */}
      {showRegionOnboarding && (
        <RegionStandardSheet mode="onboarding" onClose={() => setShowRegionOnboarding(false)} />
      )}
    </div>
  );
};

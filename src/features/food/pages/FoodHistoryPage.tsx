import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, SlidersHorizontal, Globe } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { FoodScan } from '../types';
import { FoodHistory } from '../components/FoodHistory';
import { FoodDetailModal } from '../components/FoodDetailModal';
import { NutritionPrioritySheet } from '../components/NutritionPrioritySheet';
import { RegionStandardSheet } from '../components/RegionStandardSheet';

export const FoodHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedScan, setSelectedScan]   = useState<FoodScan | null>(null);
  const [showPriority, setShowPriority]   = useState(false);
  const [showRegion, setShowRegion]       = useState(false);

  const handleDeleted = (id: string) => {
    setSelectedScan(null);
  };

  const handleUpdated = (updated: FoodScan) => {
    setSelectedScan(updated);
  };

  return (
    <div className="px-4 py-5 max-w-[480px] mx-auto">

      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 4 }}>
            Food
          </p>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Scan History
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRegion(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            aria-label="Food safety region">
            <Globe className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>
          <button
            onClick={() => setShowPriority(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-all"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            aria-label="Priority nutrients">
            <SlidersHorizontal className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>
          <button
            onClick={() => navigate('/food/scan')}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12px] font-bold active:scale-95 transition-all"
            style={{ background: '#C8FF00', color: '#000' }}>
            <Camera className="w-3.5 h-3.5" /> Scan
          </button>
        </div>
      </div>

      <FoodHistory onViewDetail={(scan) => setSelectedScan(scan)} onScan={() => navigate('/food/scan')} />

      <AnimatePresence>
        {selectedScan && (
          <motion.div key={selectedScan.id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FoodDetailModal
              scan={selectedScan}
              onClose={() => setSelectedScan(null)}
              onDeleted={handleDeleted}
              onUpdated={handleUpdated}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showPriority && (
        <NutritionPrioritySheet onClose={() => setShowPriority(false)} />
      )}

      {showRegion && (
        <RegionStandardSheet mode="settings" onClose={() => setShowRegion(false)} />
      )}

      {/* Floating scan button — always-visible entry to the scanner */}
      <button
        onClick={() => navigate('/food/scan')}
        className="fixed z-[120] flex items-center gap-2 px-5 h-14 rounded-full text-[15px] font-bold text-black active:scale-95 transition-transform"
        style={{
          background: '#C8FF00',
          right: 'max(20px, env(safe-area-inset-right))',
          bottom: 'calc(env(safe-area-inset-bottom) + 88px)',
          boxShadow: '0 8px 24px rgba(200,255,0,0.3), 0 2px 8px rgba(0,0,0,0.4)',
        }}>
        <Camera className="w-5 h-5" /> Scan
      </button>
    </div>
  );
};

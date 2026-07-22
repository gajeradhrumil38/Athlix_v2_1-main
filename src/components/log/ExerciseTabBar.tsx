import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import type { ExerciseEntry } from '../../pages/Log';

interface ExerciseTabBarProps {
  exercises: ExerciseEntry[];
  activeIndex: number;
  onTabClick: (index: number) => void;
  onAddExercise: () => void;
  showAddButton?: boolean;
}

export const ExerciseTabBar: React.FC<ExerciseTabBarProps> = ({
  exercises,
  activeIndex,
  onTabClick,
  onAddExercise,
  showAddButton = true,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const activeTab = scrollRef.current.children[activeIndex] as HTMLElement;
      if (activeTab) {
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeIndex]);

  return (
    <div className="flex h-[52px] flex-shrink-0 items-center bg-[var(--bg-base)]/70 px-3 backdrop-blur-xl scroll-fade-header" style={{ '--scroll-fade-color': 'rgba(10,12,16,0.7)' } as React.CSSProperties}>
      <div 
        ref={scrollRef}
        className="flex-1 flex items-center overflow-x-auto no-scrollbar h-full"
      >
        {exercises.map((ex, i) => {
          const isActive = activeIndex === i;
          const doneSets = ex.sets.filter(s => s.done).length;
          const totalSets = ex.sets.length;

          return (
            <button
              key={ex.id}
              onClick={() => onTabClick(i)}
              className={`inline-flex flex-col items-center px-3 py-1.5 mr-2 rounded-xl min-w-fit cursor-pointer transition-all border ${
                isActive
                  ? 'border-white/20 bg-white/[0.05]'
                  : 'bg-transparent border-transparent'
              }`}
            >
              <span 
                className={`text-[9px] font-semibold uppercase tracking-wider ${
                  isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                {ex.name.length > 12 ? ex.name.substring(0, 10) + '..' : ex.name}
              </span>
              <span className="mt-0.5 text-[7px] font-semibold tracking-[0.5px] text-[var(--text-muted)]">
                {doneSets}/{totalSets} SETS
              </span>
            </button>
          );
        })}
      </div>

      {showAddButton && (
        <button 
          onClick={onAddExercise}
          className="ml-2 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-transform active:scale-90"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

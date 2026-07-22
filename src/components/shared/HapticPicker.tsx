import React, { useRef, useEffect, useState } from 'react';

interface HapticPickerProps {
  items: (string | number)[];
  value: string | number;
  onChange: (value: string | number) => void;
  itemHeight?: number;
  visibleItems?: number;
  className?: string;
}

export const HapticPicker: React.FC<HapticPickerProps> = ({
  items,
  value,
  onChange,
  itemHeight = 40,
  visibleItems = 5,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastVibratedIndex = useRef<number>(-1);

  const halfVisible = Math.floor(visibleItems / 2);
  const paddingHeight = halfVisible * itemHeight;

  useEffect(() => {
    if (containerRef.current && !isScrolling) {
      const index = items.indexOf(value);
      if (index !== -1) {
        containerRef.current.scrollTop = index * itemHeight;
      }
    }
  }, [value, items, itemHeight, isScrolling]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    
    setIsScrolling(true);
    
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }

    const scrollTop = containerRef.current.scrollTop;
    const index = Math.round(scrollTop / itemHeight);
    
    if (index !== lastVibratedIndex.current && index >= 0 && index < items.length) {
      if (navigator.vibrate) navigator.vibrate(10);
      lastVibratedIndex.current = index;
    }

    scrollTimeout.current = setTimeout(() => {
      setIsScrolling(false);
      const finalIndex = Math.round(containerRef.current!.scrollTop / itemHeight);
      if (finalIndex >= 0 && finalIndex < items.length && items[finalIndex] !== value) {
        onChange(items[finalIndex]);
      }
    }, 150);
  };

  return (
    <div 
      className={`relative overflow-hidden ${className}`}
      style={{ height: itemHeight * visibleItems }}
    >
      {/* Selection Highlight */}
      <div 
        className="absolute left-0 right-0 pointer-events-none border-y border-[var(--accent)]/30 bg-[var(--accent)]/5 shadow-[0_0_15px_rgba(200,255,0,0.2)] transition-all duration-200"
        style={{ 
          top: paddingHeight, 
          height: itemHeight,
          zIndex: 1
        }}
      />
      
      {/* Scroll Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto snap-y snap-mandatory hide-scrollbar relative z-10"
        style={{ 
          perspective: '1000px',
          paddingTop: paddingHeight,
          paddingBottom: paddingHeight
        }}
      >
        {items.map((item, index) => {
          const isSelected = item === value;
          return (
            <div
              key={item}
              className={`flex items-center justify-center snap-center transition-all duration-200 ${
                isSelected ? 'text-[var(--accent)] font-bold text-xl' : 'text-gray-500 text-base'
              }`}
              style={{ 
                height: itemHeight,
                transformOrigin: 'center center',
                transform: isSelected ? 'scale(1.1)' : 'scale(1)'
              }}
            >
              {item}
            </div>
          );
        })}
      </div>
      
      {/* Fade Overlays */}
      <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-[#1A1A1A] to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#1A1A1A] to-transparent pointer-events-none z-20" />
    </div>
  );
};

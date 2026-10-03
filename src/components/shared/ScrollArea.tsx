import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from '../../config/icons';

// A scrollable region that shows there's more: the edge with hidden content
// fades out (mask), and a small "More" pill scrolls down a page. Nothing is
// drawn when everything fits.
// className: the wrapper (margins); contentClassName: the list itself (padding, spacing).
export const ScrollArea: React.FC<{ maxHeight: number; className?: string; contentClassName?: string; children: React.ReactNode }> = ({ maxHeight, className = '', contentClassName = '', children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);

  useEffect(() => {
    update();
    const ro = new ResizeObserver(update);
    if (ref.current) ro.observe(ref.current);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [update]);

  const fade = 36;
  const mask = edges.top && edges.bottom
    ? `linear-gradient(to bottom, transparent, #000 ${fade}px, #000 calc(100% - ${fade}px), transparent)`
    : edges.bottom ? `linear-gradient(to bottom, #000 calc(100% - ${fade}px), transparent)`
    : edges.top ? `linear-gradient(to bottom, transparent, #000 ${fade}px)`
    : undefined;

  return (
    <div className={`relative ${className}`}>
      <div ref={ref} onScroll={update} className="overflow-y-auto"
        style={{ maxHeight, maskImage: mask, WebkitMaskImage: mask }}>
        <div ref={contentRef} className={contentClassName}>{children}</div>
      </div>
      {edges.bottom && (
        <button type="button" aria-label="Scroll for more"
          onClick={() => ref.current?.scrollBy({ top: ref.current.clientHeight * 0.8, behavior: 'smooth' })}
          className="absolute bottom-1 left-1/2 -translate-x-1/2 h-6 pl-2.5 pr-1.5 rounded-full text-[10px] font-bold flex items-center gap-0.5"
          style={{ background: 'color-mix(in srgb, var(--text-primary) 10%, transparent)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: 'var(--text-secondary)' }}>
          More <AppIcon name="ExpandDown" size="sm" />
        </button>
      )}
    </div>
  );
};

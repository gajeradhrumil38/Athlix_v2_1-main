import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, TrendingUp, Zap } from 'lucide-react';

// Instant post-log coaching — the "fast reply after I log a set". Fully
// DETERMINISTIC (compares the just-completed set to last time's working set,
// both already in the logger's hands) so it appears the moment you tap done,
// with zero AI latency. Fires only on a beat/matched working set; warm-up and
// back-off sets (below last time) stay quiet to avoid noise.

interface SetDetail {
  name: string;
  weight: number | null;
  reps: number | null;
  unit: string;
  last: { weight: number; reps: number } | null;
}

type Kind = 'best' | 'reps' | 'match';
interface Flash { id: number; kind: Kind; title: string; sub: string }

function compute(d: SetDetail): Flash | null {
  const w = Number(d.weight || 0);
  const r = Number(d.reps || 0);
  if (r <= 0) return null;                    // not a trackable strength set
  const last = d.last;
  if (!last || !last.weight) return null;     // no baseline yet — stay quiet

  const lw = Number(last.weight);
  const lr = Number(last.reps);
  const id = Date.now();

  if (w > lw) {
    const delta = Math.round((w - lw) * 10) / 10;
    return { id, kind: 'best', title: `New best · ${d.name}`, sub: `${w}${d.unit} × ${r} — +${delta}${d.unit} on last time` };
  }
  if (w === lw && r > lr) {
    return { id, kind: 'reps', title: `Rep PR · ${d.name}`, sub: `${w}${d.unit} × ${r} — +${r - lr} rep${r - lr === 1 ? '' : 's'} on last time` };
  }
  if (w === lw && r === lr) {
    return { id, kind: 'match', title: `Matched last time · ${d.name}`, sub: `${w}${d.unit} × ${r} — go heavier next set` };
  }
  return null;                                // below last time → quiet
}

export const SetFeedbackFlash: React.FC = () => {
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const f = compute((e as CustomEvent<SetDetail>).detail);
      if (!f) return;
      setFlash(f);
      window.setTimeout(() => setFlash((cur) => (cur?.id === f.id ? null : cur)), 2800);
    };
    window.addEventListener('athlix:set-logged', handler);
    return () => window.removeEventListener('athlix:set-logged', handler);
  }, []);

  const positive = flash && flash.kind !== 'match';

  return (
    <AnimatePresence>
      {flash && (
        <motion.div
          key={flash.id}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className="fixed left-1/2 z-[120] flex items-center gap-2.5 rounded-2xl px-4 py-2.5"
          style={{
            top: 'calc(env(safe-area-inset-top) + 12px)',
            translateX: '-50%',
            maxWidth: 'calc(100vw - 28px)',
            pointerEvents: 'none',
            background: positive ? 'linear-gradient(135deg, rgba(200,255,0,0.18), rgba(200,255,0,0.06))' : 'var(--bg-elevated)',
            border: `1px solid ${positive ? 'rgba(200,255,0,0.45)' : 'var(--border)'}`,
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          }}
        >
          <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: positive ? 'rgba(200,255,0,0.18)' : 'var(--bg-surface)' }}>
            {flash.kind === 'best' ? <Award className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              : flash.kind === 'reps' ? <TrendingUp className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              : <Zap className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{flash.title}</p>
            <p className="text-[10.5px] leading-tight truncate" style={{ color: 'var(--text-secondary)' }}>{flash.sub}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

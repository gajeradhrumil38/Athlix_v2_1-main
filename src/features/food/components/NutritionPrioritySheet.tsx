/**
 * NutritionPrioritySheet — let the user pick up to 3 macros to highlight
 * across all scan results and history views.
 */

import React from 'react';
import { X } from 'lucide-react';
import { type MacroKey, useNutritionPriority } from '../hooks/useNutritionPriority';

const MACROS: { key: MacroKey; label: string; color: string }[] = [
  { key: 'calories', label: 'Calories', color: '#C8FF00' },
  { key: 'protein',  label: 'Protein',  color: '#60a5fa' },
  { key: 'carbs',    label: 'Carbs',    color: '#fbbf24' },
  { key: 'fat',      label: 'Fat',      color: '#f87171' },
  { key: 'fiber',    label: 'Fiber',    color: '#4ade80' },
  { key: 'sugar',    label: 'Sugar',    color: '#c084fc' },
];

interface Props { onClose: () => void }

export const NutritionPrioritySheet: React.FC<Props> = ({ onClose }) => {
  const { priorities, toggle, isPriority, max } = useNutritionPriority();

  return (
    <div className="fixed inset-0 z-[350] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-[480px] rounded-t-[24px] pb-[max(28px,env(safe-area-inset-bottom))]"
        style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)' }}>

        <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-5" style={{ background: 'rgba(255,255,255,0.3)' }} />

        <div className="flex items-center justify-between px-5 mb-2">
          <div>
            <p style={{ color: '#fff', fontSize: 17, fontWeight: 800 }}>Priority Nutrients</p>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 }}>
              Highlighted in every scan result and history view
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.6)' }} />
          </button>
        </div>

        {/* Selection limit hint */}
        <div className="mx-5 mb-4 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.15)' }}>
          <p style={{ color: '#C8FF00', fontSize: 11, fontWeight: 700 }}>
            {priorities.length}/{max} selected
            {priorities.length >= max ? ' — tap a selected item to deselect' : ''}
          </p>
        </div>

        {/* Macro pills */}
        <div className="grid grid-cols-3 gap-3 px-5 pb-2">
          {MACROS.map(({ key, label, color }) => {
            const selected = isPriority(key);
            const disabled = !selected && priorities.length >= max;
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                disabled={disabled}
                className="flex flex-col items-center gap-2 rounded-2xl py-4 px-3 transition-all active:scale-95 disabled:opacity-40"
                style={{
                  background:  selected ? `${color}18` : 'rgba(255,255,255,0.04)',
                  border:      selected ? `1.5px solid ${color}` : '1.5px solid rgba(255,255,255,0.08)',
                }}>
                {/* Colour dot */}
                <div className="w-3 h-3 rounded-full" style={{ background: selected ? color : 'rgba(255,255,255,0.2)' }} />
                <p style={{
                  color:      selected ? color : 'rgba(255,255,255,0.6)',
                  fontSize:   13,
                  fontWeight: 700,
                }}>
                  {label}
                </p>
                {selected && (
                  <div className="w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: color }}>
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                      <path d="M1 3L3 5L7 1" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="px-5 pt-4">
          <button onClick={onClose}
            className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-black active:scale-[0.98] transition-all"
            style={{ background: '#C8FF00' }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

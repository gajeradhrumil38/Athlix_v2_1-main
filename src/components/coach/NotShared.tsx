import React from 'react';

// Shown in place of a section the trainee hasn't shared. Calm, not alarming —
// it's a normal state, not an error.
export const NotShared: React.FC<{ label: string }> = ({ label }) => (
  <div
    className="rounded-2xl px-5 py-6 text-center"
    style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)' }}
  >
    <p className="text-[15px] font-semibold text-[var(--text-secondary)]">{label} not shared</p>
    <p className="text-[13px] text-[var(--text-muted)] mt-1">Your trainee can turn this on any time.</p>
  </div>
);

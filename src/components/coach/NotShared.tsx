import React from 'react';
import { EmptyState, WidgetCard } from './overview/Widget';

// Shown in place of a section the trainee hasn't shared. Calm, not alarming —
// it's a normal state, not an error. Same card shell as every Overview card.
export const NotShared: React.FC<{ label: string }> = ({ label }) => (
  <WidgetCard title={label}>
    <EmptyState icon="Coach" text="Not shared — your trainee can turn this on any time." />
  </WidgetCard>
);

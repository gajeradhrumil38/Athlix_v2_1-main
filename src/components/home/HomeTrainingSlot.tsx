import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearDraft, DRAFT_EVENT, readDraft, startPlanDayDraft, writeDraft } from '../../lib/workoutDraft';
import type { WorkoutState } from '../../pages/Log';
import { CoachPlanCard } from './CoachPlanCard';
import { TodaySessionCard } from './TodaySessionCard';
import { confirmDialog } from '../shared/ConfirmDialog';

// Top of Home: an in-progress session as a tick-off card, otherwise the coach
// plan card whose Start begins that session right here.
export const HomeTrainingSlot: React.FC = () => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<WorkoutState | null>(() => readDraft());

  useEffect(() => {
    const sync = () => setDraft(readDraft());
    window.addEventListener(DRAFT_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DRAFT_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (draft && draft.exercises.length > 0) {
    return (
      <TodaySessionCard
        workout={draft}
        onChange={(next) => { setDraft(next); writeDraft(next); }}
        onDiscard={async () => { if (await confirmDialog({ title: 'Discard this session?', message: 'Nothing will be saved.', confirmLabel: 'Discard', danger: true })) clearDraft(); }}
        onOpenLogger={() => navigate('/log')}
        onFinish={() => navigate('/log?finish=1')}
      />
    );
  }
  return <CoachPlanCard onStartDay={(plan, day) => { startPlanDayDraft(plan, day); }} />;
};

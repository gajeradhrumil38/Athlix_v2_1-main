# Create Exercise Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Create Exercise" bottom sheet inside ExercisePicker that lets users name an exercise, pick a primary muscle group (dropdown + search), tap slug-level muscles on an interactive SVG body map (primary/secondary), and save — auto-adding the exercise to the active workout.

**Architecture:** New `CreateExerciseSheet.tsx` component opens stacked over the existing picker. Supabase `exercise_library` gets a `muscle_slugs JSONB` column via migration. `addCustomExercise` in `supabaseData.ts` is extended to persist slug selections. On save, the new exercise is passed directly to `onSelect` and both sheets close.

**Tech Stack:** React 18, TypeScript, Framer Motion, `react-muscle-highlighter` (Body component), Supabase Postgres, Tailwind + CSS vars.

---

### Task 1: DB Migration — add muscle_slugs column

**Files:**
- Create: `supabase/migrations/20260615000001_exercise_library_muscle_slugs.sql`

- [ ] Write migration

```sql
ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS muscle_slugs JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.exercise_library.muscle_slugs IS
  'Array of {slug, type} objects e.g. [{"slug":"chest","type":"primary"},{"slug":"triceps","type":"secondary"}]';
```

- [ ] Commit

```bash
git add supabase/migrations/20260615000001_exercise_library_muscle_slugs.sql
git commit -m "feat: add muscle_slugs JSONB column to exercise_library"
```

---

### Task 2: Add Dumbbell icon to central registry

**Files:**
- Modify: `src/config/icons.tsx`

- [ ] Add import and registry entry

In the import block add `Dumbbell` from lucide-react. In the `ICONS` object add `CreateExercise: Dumbbell`.

- [ ] Commit

```bash
git add src/config/icons.tsx
git commit -m "feat: add CreateExercise (Dumbbell) icon to registry"
```

---

### Task 3: Extend addCustomExercise in supabaseData.ts

**Files:**
- Modify: `src/lib/supabaseData.ts:2211-2251`

- [ ] Extend signature and payload

```ts
export const addCustomExercise = async (
  userId: string,
  name: string,
  muscleGroup: string,
  muscleSlugs: { slug: string; type: 'primary' | 'secondary' }[] = [],
) => {
  // ... existing duplicate-check logic unchanged ...
  const item: LocalExerciseLibraryItem = {
    id: createId(),
    name: normalizedName,
    muscle_group: muscleGroup,
    is_custom: true,
    user_id: userId,
    exercise_db_id: matchedAssetId,
    muscle_slugs: muscleSlugs,   // NEW
  };
  // ... rest unchanged ...
```

- [ ] Commit

```bash
git add src/lib/supabaseData.ts
git commit -m "feat: extend addCustomExercise to persist muscle_slugs"
```

---

### Task 4: Build CreateExerciseSheet component

**Files:**
- Create: `src/components/log/CreateExerciseSheet.tsx`

- [ ] Implement component

```tsx
import React, { useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import Body, { ExtendedBodyPart } from 'react-muscle-highlighter';
import { X, ChevronLeft, ChevronDown, Check, Dumbbell } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { addCustomExercise, searchExerciseLibrary } from '../../lib/supabaseData';
import { MUSCLE_SLUG_LABELS, MUSCLE_SLUG_REGION_MAP, type MuscleSlug } from '../../lib/exerciseMuscles';

// ── Constants ────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = [
  { name: 'Chest',     cssVar: '--chest'     },
  { name: 'Back',      cssVar: '--back'      },
  { name: 'Shoulders', cssVar: '--shoulders' },
  { name: 'Biceps',    cssVar: '--biceps'    },
  { name: 'Triceps',   cssVar: '--triceps'   },
  { name: 'Legs',      cssVar: '--legs'      },
  { name: 'Core',      cssVar: '--core'      },
  { name: 'Cardio',    cssVar: '--cardio'    },
  { name: 'Yoga',      cssVar: '--purple'    },
];

const PRIMARY_COLOR = 'rgba(200,255,0,0.9)';
const SECONDARY_COLOR = 'rgba(120,160,255,0.65)';

type SlugType = 'primary' | 'secondary';
type SlugMap = Map<string, SlugType>;

interface CreateExerciseSheetProps {
  onClose: () => void;
  onCreated: (exercise: { id: string; name: string; muscleGroup: string }) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const CreateExerciseSheet: React.FC<CreateExerciseSheetProps> = ({ onClose, onCreated }) => {
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [muscleGroup, setMuscleGroup] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [slugMap, setSlugMap] = useState<SlugMap>(new Map());
  const [view, setView] = useState<'front' | 'back'>('front');
  const [saving, setSaving] = useState(false);
  const dupCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ──────────────────────────────────────────────────────────────

  const filteredGroups = useMemo(
    () => MUSCLE_GROUPS.filter((g) => g.name.toLowerCase().includes(groupSearch.toLowerCase())),
    [groupSearch],
  );

  const bodyData = useMemo((): ExtendedBodyPart[] => {
    const parts: ExtendedBodyPart[] = [];
    slugMap.forEach((type, slug) => {
      parts.push({
        slug: slug as any,
        intensity: type === 'primary' ? 4 : 2,
        color: type === 'primary' ? PRIMARY_COLOR : SECONDARY_COLOR,
      });
    });
    return parts;
  }, [slugMap]);

  const selectedSlugs = useMemo(() => {
    const primary: string[] = [];
    const secondary: string[] = [];
    slugMap.forEach((type, slug) => {
      if (type === 'primary') primary.push(slug);
      else secondary.push(slug);
    });
    return { primary, secondary };
  }, [slugMap]);

  const canSave = name.trim().length > 0 && !nameError && !saving;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleNameChange = (val: string) => {
    setName(val);
    setNameError(null);
    if (dupCheckTimer.current) clearTimeout(dupCheckTimer.current);
    if (!val.trim() || !user) return;
    dupCheckTimer.current = setTimeout(async () => {
      const results = await searchExerciseLibrary(user.id, val.trim());
      const dup = results.find((r) => r.name.toLowerCase() === val.trim().toLowerCase());
      if (dup) setNameError('An exercise with this name already exists');
    }, 400);
  };

  const handleSlugPress = (part: ExtendedBodyPart) => {
    const slug = part.slug as string;
    if (!slug) return;
    setSlugMap((prev) => {
      const next = new Map(prev);
      const current = next.get(slug);
      if (!current) {
        next.set(slug, 'primary');
        // Auto-suggest muscle group from first primary slug
        if (!muscleGroup) {
          const region = MUSCLE_SLUG_REGION_MAP[slug as MuscleSlug];
          const match = MUSCLE_GROUPS.find((g) => g.name === region);
          if (match) setMuscleGroup(match.name);
        }
      } else if (current === 'primary') {
        next.set(slug, 'secondary');
      } else {
        next.delete(slug);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!user || !canSave) return;
    const trimmedName = name.trim();
    const group = muscleGroup || (selectedSlugs.primary[0]
      ? (MUSCLE_SLUG_REGION_MAP[selectedSlugs.primary[0] as MuscleSlug] ?? 'Core')
      : 'Core');

    const slugsPayload = [
      ...selectedSlugs.primary.map((s) => ({ slug: s, type: 'primary' as const })),
      ...selectedSlugs.secondary.map((s) => ({ slug: s, type: 'secondary' as const })),
    ];

    setSaving(true);
    try {
      const result = await addCustomExercise(user.id, trimmedName, group, slugsPayload);
      toast.success('Exercise created!');
      onCreated({ id: result.id, name: trimmedName, muscleGroup: group });
    } catch {
      toast.error('Failed to save exercise');
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="absolute inset-0 mx-auto w-full max-w-[860px] flex flex-col border-x"
        style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-medium"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Create Exercise
          </h2>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-[120px] space-y-5">

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
              Exercise Name
            </label>
            <input
              type="text"
              placeholder="e.g. Cable Fly"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full h-12 rounded-xl px-4 text-[15px] focus:outline-none transition-colors"
              style={{
                background: 'var(--bg-surface)',
                border: nameError ? '1.5px solid #f87171' : '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            {nameError && (
              <p className="text-[11px]" style={{ color: '#f87171' }}>{nameError}</p>
            )}
          </div>

          {/* Primary Muscle Group Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
              Primary Muscle Group
            </label>
            <button
              onClick={() => setShowDropdown((v) => !v)}
              className="w-full h-12 rounded-xl px-4 flex items-center justify-between text-[14px] font-medium"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: muscleGroup ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <span>{muscleGroup || 'Select muscle group…'}</span>
              <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
            {showDropdown && (
              <div
                className="rounded-xl overflow-hidden mt-1"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              >
                <div className="px-3 pt-2.5 pb-1.5">
                  <input
                    type="text"
                    placeholder="Search groups…"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    autoFocus
                    className="w-full h-9 rounded-lg px-3 text-[13px] focus:outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
                {filteredGroups.map((g) => (
                  <button
                    key={g.name}
                    onClick={() => { setMuscleGroup(g.name); setShowDropdown(false); setGroupSearch(''); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-left"
                    style={{ color: muscleGroup === g.name ? `var(${g.cssVar})` : 'var(--text-primary)', borderTop: '1px solid var(--border)' }}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: `var(${g.cssVar})` }}
                    />
                    {g.name}
                    {muscleGroup === g.name && <Check className="w-3.5 h-3.5 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Muscle Map */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
                Target Muscles
              </label>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Tap once = primary · tap twice = secondary · tap again = remove
              </p>
            </div>

            {/* Legend */}
            <div className="flex gap-3">
              {[
                { label: 'Primary', color: PRIMARY_COLOR },
                { label: 'Secondary', color: SECONDARY_COLOR },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Front / Back toggle */}
            <div className="flex gap-1 rounded-xl p-1 w-fit" style={{ background: 'var(--bg-elevated)' }}>
              {(['front', 'back'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-5 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-all"
                  style={view === v
                    ? { background: 'var(--accent)', color: '#000' }
                    : { background: 'transparent', color: 'var(--text-secondary)' }
                  }
                >
                  {v}
                </button>
              ))}
            </div>

            {/* SVG body */}
            <div
              className="rounded-2xl overflow-hidden flex justify-center items-center py-4"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', minHeight: 280 }}
            >
              <Body
                data={bodyData}
                side={view}
                gender="male"
                scale={0.9}
                defaultFill="#1A2538"
                border="#1E2F42"
                defaultStroke="#1E2F42"
                defaultStrokeWidth={1}
                onBodyPartPress={handleSlugPress}
              />
            </div>

            {/* Selected muscle chips */}
            {slugMap.size > 0 && (
              <div className="space-y-2">
                {selectedSlugs.primary.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider self-center" style={{ color: 'rgba(200,255,0,0.7)' }}>Primary:</span>
                    {selectedSlugs.primary.map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: 'rgba(200,255,0,0.1)', color: 'rgba(200,255,0,0.9)', border: '1px solid rgba(200,255,0,0.25)' }}
                      >
                        {MUSCLE_SLUG_LABELS[s as MuscleSlug] ?? s}
                      </span>
                    ))}
                  </div>
                )}
                {selectedSlugs.secondary.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider self-center" style={{ color: 'rgba(120,160,255,0.7)' }}>Secondary:</span>
                    {selectedSlugs.secondary.map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: 'rgba(120,160,255,0.1)', color: 'rgba(120,160,255,0.9)', border: '1px solid rgba(120,160,255,0.25)' }}
                      >
                        {MUSCLE_SLUG_LABELS[s as MuscleSlug] ?? s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Save footer */}
        <div
          className="shrink-0 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}
        >
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full py-4 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            <Dumbbell className="w-4 h-4" />
            {saving ? 'Saving…' : 'Create & Add to Workout'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
```

- [ ] Commit

```bash
git add src/components/log/CreateExerciseSheet.tsx
git commit -m "feat: add CreateExerciseSheet with interactive muscle map"
```

---

### Task 5: Wire CreateExerciseSheet into ExercisePicker

**Files:**
- Modify: `src/components/log/ExercisePicker.tsx`

- [ ] Add state + import + render

Add `showCreate` boolean state. Import `CreateExerciseSheet`. Add a "Create Exercise" button as a sticky footer inside the scrollable area (before multi-select footer). Render `<CreateExerciseSheet>` when `showCreate` is true. On `onCreated`, call `onSelect(exercise)` then `onClose()`.

- [ ] Commit

```bash
git add src/components/log/ExercisePicker.tsx
git commit -m "feat: wire Create Exercise button into ExercisePicker"
```

---

### Task 6: TypeScript check

- [ ] Run tsc

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npx tsc --noEmit
```

Fix any errors before final commit.

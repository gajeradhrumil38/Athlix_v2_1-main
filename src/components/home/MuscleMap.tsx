import React, { useState, useMemo } from 'react'
import Body, { ExtendedBodyPart, Slug } from 'react-muscle-highlighter'
import { getMuscleSlugLabel, MUSCLE_SLUG_LABELS, type MuscleSlug } from '../../lib/exerciseMuscles'

export interface MuscleData {
  [group: string]: { sessions: number; sets: number; load: number; relativeLoad: number }
}

interface MuscleMapProps {
  muscleData: MuscleData
  view: 'front' | 'back'
  onViewChange: (v: 'front' | 'back') => void
  title?: string
  unit?: string
}

const VALID_SLUGS = new Set<Slug>(Object.keys(MUSCLE_SLUG_LABELS) as MuscleSlug[])

const SLUG_HEX: Record<string, string> = {
  chest:         '#F09595',
  biceps:        '#85B7EB',
  triceps:       '#AFA9EC',
  deltoids:      '#AFA9EC',
  abs:           '#ff7a59',
  obliques:      '#ff7a59',
  'upper-back':  '#5DCAA5',
  'lower-back':  '#5DCAA5',
  trapezius:     '#5DCAA5',
  quadriceps:    '#EF9F27',
  hamstring:     '#EF9F27',
  calves:        '#EF9F27',
  gluteal:       '#F4B96A',
  adductors:     '#EF9F27',
  tibialis:      '#98D4E8',
  ankles:        '#98D4E8',
  forearm:       '#98D4E8',
  neck:          '#AFA9EC',
}
const SLUG_HEX_FALLBACK = '#8692a4'

const INTENSITY_ALPHA = [0.45, 0.65, 0.85, 1.0]

const hexAlpha = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const slugColor = (slug: string, intensity: number): string =>
  hexAlpha(SLUG_HEX[slug] ?? SLUG_HEX_FALLBACK, INTENSITY_ALPHA[Math.min(intensity, 4) - 1] ?? 1)

const slugBaseHex = (slug: string): string => SLUG_HEX[slug] ?? SLUG_HEX_FALLBACK

type MuscleEntry = MuscleData[string]

const loadToIntensity = (load: number, maxLoad: number): number => {
  if (load <= 0 || maxLoad <= 0) return 0
  const ratio = load / maxLoad
  if (ratio >= 0.75) return 4
  if (ratio >= 0.45) return 3
  if (ratio >= 0.18) return 2
  return 1
}

const getMetric = (entry: MuscleEntry) => entry.relativeLoad || entry.load || entry.sets || 0

export const MuscleMap: React.FC<MuscleMapProps> = ({
  muscleData, view, onViewChange, title, unit = 'lbs'
}) => {
  const [tooltip, setTooltip] = useState<{ slug: string; x: number; y: number } | null>(null)

  const bodyData = useMemo((): ExtendedBodyPart[] => {
    const parts: ExtendedBodyPart[] = []
    const muscleEntries = Object.values(muscleData) as MuscleEntry[]
    const maxLoad = Math.max(...muscleEntries.map(getMetric), 0)

    ;(Object.entries(muscleData) as Array<[string, MuscleEntry]>).forEach(([slug, data]) => {
      if (!VALID_SLUGS.has(slug as Slug)) return
      const intensity = loadToIntensity(getMetric(data), maxLoad)
      if (intensity === 0) return
      parts.push({ slug: slug as Slug, intensity, color: slugColor(slug, intensity) })
    })
    return parts
  }, [muscleData])

  const handlePress = (part: ExtendedBodyPart, e?: React.MouseEvent) => {
    const slug = part.slug || ''
    const rect = (e?.currentTarget as HTMLElement)
      ?.closest('.muscle-map-wrap')
      ?.getBoundingClientRect()
    setTooltip({
      slug,
      x: e ? e.clientX - (rect?.left || 0) : 100,
      y: e ? e.clientY - (rect?.top || 0) : 100,
    })
    setTimeout(() => setTooltip(null), 2200)
  }

  const displayMax = useMemo(() => {
    const vals = (Object.values(muscleData) as MuscleEntry[]).map(getMetric).filter(v => v > 0).sort((a, b) => a - b)
    if (vals.length === 0) return 0
    const max = vals[vals.length - 1]
    const second = vals.length > 1 ? vals[vals.length - 2] : max
    // If max is 100x+ above second-highest, it's a corrupted outlier — cap bars at 10x second
    return max > second * 100 ? second * 10 : max
  }, [muscleData])

  const trainedGroups = useMemo(
    () =>
      (Object.entries(muscleData) as Array<[string, MuscleEntry]>)
        .filter(([, d]) => getMetric(d) > 0)
        .sort((a, b) => getMetric(b[1]) - getMetric(a[1])),
    [muscleData]
  )

  return (
    <div style={{
      background: 'linear-gradient(160deg, rgba(14,24,36,0.95) 0%, rgba(10,18,28,0.98) 65%, rgba(8,12,18,1) 100%)',
      borderRadius: 14,
      border: '0.5px solid var(--border)',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 0%, rgba(200,255,0,0.12), transparent 55%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 10px 6px', position: 'relative', zIndex: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 9, letterSpacing: '1.2px', color: 'rgba(255,255,255,0.8)', fontWeight: 700, textTransform: 'uppercase' }}>
          {title || 'Muscle Map'}
        </span>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(12,20,30,0.7)', padding: 3, borderRadius: 999, border: '0.5px solid var(--border)' }}>
          {(['front', 'back'] as const).map(v => (
            <button key={v} onClick={() => onViewChange(v)}
              style={{
                padding: '3px 10px', borderRadius: 999,
                fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: view === v ? 'rgba(200,255,0,0.18)' : 'transparent',
                color: view === v ? 'var(--accent)' : '#cdd6e1',
                outline: view === v ? '0.5px solid rgba(200,255,0,0.4)' : 'none',
                boxShadow: view === v ? '0 0 10px rgba(200,255,0,0.25)' : 'none',
              }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Body: split row */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 4, padding: '0 6px 8px', position: 'relative', zIndex: 1 }}>

        {/* Left — body SVG */}
        <div className="muscle-map-wrap"
          style={{ flex: '0 0 42%', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Body
            data={bodyData}
            side={view}
            gender="male"
            scale={0.88}
            defaultFill="#1A2538"
            border="#1E2F42"
            defaultStroke="#1E2F42"
            defaultStrokeWidth={1}
            onBodyPartPress={(part) => handlePress(part)}
          />
          {tooltip && (() => {
            const slug = tooltip.slug
            const d = muscleData[slug]
            const color = slugBaseHex(slug)
            return (
              <div style={{
                position: 'absolute',
                left: Math.max(4, Math.min(tooltip.x - 55, 140)),
                top: Math.max(4, tooltip.y - 55),
                background: '#141C28', border: '0.5px solid #1E2F42',
                borderRadius: 10, padding: '8px 12px',
                pointerEvents: 'none', zIndex: 20,
                minWidth: 120, boxShadow: '0 8px 24px rgba(0,0,0,.8)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>{getMuscleSlugLabel(slug)}</div>
                {d && d.sessions > 0 ? (
                  <>
                    <div style={{ fontSize: 9, color: '#3A5060' }}>
                      {d.sessions} session{d.sessions > 1 ? 's' : ''} · {Math.round(d.sets)} sets
                    </div>
                    <div style={{ height: 3, background: '#1E2F42', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, displayMax > 0 ? (getMetric(d) / displayMax) * 100 : 0)}%`, height: '100%', background: color, borderRadius: 2 }} />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 9, color: '#3A5060' }}>Not trained this period</div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Right — muscle bar list */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 0, paddingRight: 2 }}>
          {trainedGroups.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: '#4A5A6A', textAlign: 'center' }}>Log a workout to light up your muscles</span>
            </div>
          ) : (
            trainedGroups.map(([group, d], i) => {
              const pct = displayMax > 0 ? Math.min((getMetric(d) / displayMax) * 100, 100) : 0
              const color = slugBaseHex(group)
              const raw = Math.round(d.load)
              const loadLabel = raw >= 1e12 ? `${(raw / 1e12).toFixed(0)}T` : raw >= 1e9 ? `${(raw / 1e9).toFixed(0)}B` : raw >= 1e6 ? `${(raw / 1e6).toFixed(0)}M` : raw >= 10_000 ? `${(raw / 1_000).toFixed(0)}k` : raw.toLocaleString()
              return (
                <div key={group} style={{ padding: '5px 4px 5px 2px', borderBottom: i < trainedGroups.length - 1 ? '0.5px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ width: 5, height: 5, borderRadius: 2, background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.85)', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getMuscleSlugLabel(group)}
                      </span>
                    </div>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.42)', flexShrink: 0, marginLeft: 4, whiteSpace: 'nowrap' }}>
                      {loadLabel} {unit}
                    </span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, opacity: 0.88 }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

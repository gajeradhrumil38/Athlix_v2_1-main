import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { format, subDays } from 'date-fns'
import { getWorkouts } from '../../lib/supabaseData'
import { parseDateAtStartOfDay } from '../../lib/dates'

interface TrainNextProps {
  muscleData: Record<string, { sessions: number; sets: number }>
  weekDays: { date: Date; status: string }[]
}

interface Suggestion {
  title: string
  muscles: string[]
  reason: string
  priority: 'PRIORITY' | 'RECOMMENDED' | 'OPTIONAL'
  priorityColor: string
  templateId?: string
}

const PUSH_MUSCLES = ['Chest', 'Shoulders', 'Triceps']
const PULL_MUSCLES = ['Back', 'Biceps']
const LEG_MUSCLES  = ['Legs', 'Glutes', 'Hamstrings', 'Calves']
const CORE_MUSCLES = ['Core']

// Days since each group was last trained
// Optimal rest per group (science-based):
const OPTIMAL_REST_DAYS: Record<string, number> = {
  Chest: 2, Back: 2, Shoulders: 2,
  Biceps: 2, Triceps: 2, Legs: 3,
  Core: 1, Cardio: 1,
}

export const TrainNext: React.FC<TrainNextProps> = ({
  muscleData, weekDays
}) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [lastTrained, setLastTrained] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    fetchLastTrainedDays()
  }, [user])

  useEffect(() => {
    if (Object.keys(lastTrained).length === 0) return
    computeSuggestions(lastTrained)
  }, [lastTrained, muscleData])

  const fetchLastTrainedDays = async () => {
    // Fetch last 30 days of workouts to calculate days since each muscle trained
    const data = await getWorkouts(user!.id, {
      startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    })

    if (!data) { setLoading(false); return }

    // Calculate days since each muscle group was last trained
    const daysSince: Record<string, number> = {}
    const today = new Date()

    const allMuscles = [
      ...PUSH_MUSCLES, ...PULL_MUSCLES,
      ...LEG_MUSCLES, ...CORE_MUSCLES
    ]

    allMuscles.forEach(muscle => {
      // Find most recent workout containing this muscle
      const lastWorkout = data.find(w =>
        Array.isArray(w.muscle_groups) &&
        w.muscle_groups.some((g: string) =>
          g.toLowerCase() === muscle.toLowerCase()
        )
      )
      if (lastWorkout) {
        const lastWorkoutDate = parseDateAtStartOfDay(lastWorkout.date)
        if (!lastWorkoutDate) {
          daysSince[muscle] = 99
          return
        }
        const diff = Math.floor(
          (today.getTime() - lastWorkoutDate.getTime())
          / (1000 * 60 * 60 * 24)
        )
        daysSince[muscle] = diff
      } else {
        daysSince[muscle] = 99 // never trained
      }
    })

    setLastTrained(daysSince)
    setLoading(false)
  }

  const computeSuggestions = (daysSince: Record<string, number>) => {
    const results: Suggestion[] = []

    // ── GROUP SCORES ──
    // Score = how overdue each group is (higher = more urgent)
    const groupScore = (muscles: string[]) => {
      const scores = muscles.map(m => {
        const days = daysSince[m] ?? 99
        const optimal = OPTIMAL_REST_DAYS[m] || 2
        // Over-rested = urgent; under-rested = not ready
        return days >= optimal ? days - optimal + 1 : 0
      })
      return Math.max(...scores)
    }

    const pushScore = groupScore(PUSH_MUSCLES)
    const pullScore = groupScore(PULL_MUSCLES)
    const legScore  = groupScore(LEG_MUSCLES)
    const coreScore = groupScore(CORE_MUSCLES)

    // ── PUSH ──
    if (pushScore > 0) {
      const overdueDays = Math.max(...PUSH_MUSCLES.map(m => daysSince[m] ?? 0))
      const isPriority = pushScore >= 3
      results.push({
        title: 'Push Day',
        muscles: PUSH_MUSCLES,
        reason: overdueDays >= 99
          ? 'Never trained — start building your chest and shoulders'
          : `Last push session ${overdueDays} day${overdueDays !== 1 ? 's' : ''} ago`,
        priority: isPriority ? 'PRIORITY' : 'RECOMMENDED',
        priorityColor: isPriority ? '#F09595' : 'var(--accent)',
      })
    }

    // ── PULL ──
    if (pullScore > 0) {
      const overdueDays = Math.max(...PULL_MUSCLES.map(m => daysSince[m] ?? 0))
      const isPriority = pullScore >= 3

      // Check push/pull imbalance
      const chestSets = muscleData['Chest']?.sets || 0
      const backSets  = muscleData['Back']?.sets  || 0
      const isImbalanced = chestSets > backSets * 2

      results.push({
        title: 'Pull Day',
        muscles: PULL_MUSCLES,
        reason: isImbalanced
          ? `Push-heavy week — ${chestSets} chest sets vs ${backSets} back sets`
          : overdueDays >= 99
            ? 'Never trained — essential for posture and balance'
            : `Last pull session ${overdueDays} day${overdueDays !== 1 ? 's' : ''} ago`,
        priority: isImbalanced || isPriority ? 'PRIORITY' : 'RECOMMENDED',
        priorityColor: isImbalanced ? '#EF9F27' : isPriority ? '#5DCAA5' : 'var(--accent)',
      })
    }

    // ── LEGS ──
    if (legScore > 0) {
      const overdueDays = Math.max(...LEG_MUSCLES.map(m => daysSince[m] ?? 0))
      const isVeryOverdue = legScore >= 5
      results.push({
        title: 'Leg Day',
        muscles: ['Legs', 'Glutes'],
        reason: overdueDays >= 99
          ? 'No leg sessions logged — legs are 70% of your muscle mass'
          : isVeryOverdue
            ? `${overdueDays} days since last leg day — time to train`
            : `Last leg session ${overdueDays} day${overdueDays !== 1 ? 's' : ''} ago`,
        priority: isVeryOverdue ? 'PRIORITY' : 'RECOMMENDED',
        priorityColor: isVeryOverdue ? '#EF9F27' : '#2A6090',
      })
    }

    // ── CORE ──
    if (coreScore > 0) {
      results.push({
        title: 'Core Session',
        muscles: ['Core'],
        reason: 'Core supports every other lift — train it frequently',
        priority: 'OPTIONAL',
        priorityColor: 'var(--accent)',
      })
    }

    // Sort: PRIORITY first, then by score descending
    results.sort((a, b) => {
      const order = { PRIORITY: 0, RECOMMENDED: 1, OPTIONAL: 2 }
      return order[a.priority] - order[b.priority]
    })

    // Show max 2 suggestions
    setSuggestions(results.slice(0, 2))
  }

  // ── MUSCLE COLOR MAP ──
  const muscleColor: Record<string, string> = {
    Chest: '#C45A7A', Back: '#1A9A80', Shoulders: '#0094B3',
    Biceps: '#5A9E3A', Triceps: '#4A7A2A', Legs: '#2A6090',
    Core: 'var(--accent)', Glutes: '#8A3A10', Hamstrings: '#2A5080',
  }

  if (loading) {
    return (
      <div className="animate-pulse h-full w-full rounded-xl"
        style={{ background: 'var(--bg-surface)' }}/>
    )
  }

  if (suggestions.length === 0) {
    return (
      <div className="w-full h-full rounded-xl px-3 py-3 text-center flex flex-col items-center justify-center"
        style={{
          background: 'var(--bg-surface)',
          border: '0.5px solid var(--border)'
        }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          All muscle groups covered this week 
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
          Rest up or add an optional session
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-2.5">
      {/* Section header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 6
      }}>
        <span style={{
          fontSize: 9, letterSpacing: '1.5px',
          color: 'var(--text-muted)', fontWeight: 700
        }}>
          TRAIN NEXT
        </span>
        <span style={{ fontSize: 9, color: 'var(--accent)' }}>
          AI-suggested
        </span>
      </div>

      <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto hide-scrollbar">
        {suggestions.map((s, i) => (
          <div
            key={i}
            onClick={() => navigate('/log', {
              state: {
                preselectedMuscles: s.muscles,
                suggestedTitle: s.title
              }
            })}
            style={{
              background: 'var(--bg-elevated)',
              border: `0.5px solid var(--border)`,
              borderLeft: `2.5px solid ${s.priorityColor}`,
              borderRadius: 8,
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background .15s',
            }}
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'var(--bg-hover)')
            }
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'var(--bg-elevated)')
            }
          >
            {/* Left: colored dot stack for muscle groups */}
            <div style={{
              display: 'flex', flexDirection: 'column',
              gap: 2, flexShrink: 0
            }}>
              {s.muscles.slice(0, 3).map(m => (
                <div key={m} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: muscleColor[m] || '#888'
                }}/>
              ))}
            </div>

            {/* Center: title + reason */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: 'var(--text-primary)', marginBottom: 1
              }}>
                {s.title}
              </div>
              <div style={{
                fontSize: 8, color: 'var(--text-muted)',
                lineHeight: 1.3,
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {s.reason}
              </div>
              {/* Muscle tags */}
              <div style={{
                display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap'
              }}>
                {s.muscles.map(m => (
                  <span key={m} style={{
                    fontSize: 7, padding: '1px 4px',
                    borderRadius: 4, fontWeight: 700,
                    background: `${muscleColor[m] || '#888'}18`,
                    color: muscleColor[m] || '#888',
                    border: `0.5px solid ${muscleColor[m] || '#888'}33`,
                  }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: priority badge + arrow */}
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'flex-end', gap: 4, flexShrink: 0
            }}>
              <span style={{
                fontSize: 7, padding: '1px 4px',
                borderRadius: 4, fontWeight: 700,
                background: `${s.priorityColor}18`,
                color: s.priorityColor,
                border: `0.5px solid ${s.priorityColor}33`,
                letterSpacing: '0.5px'
              }}>
                {s.priority}
              </span>
              <span style={{
                fontSize: 12, color: s.priorityColor, lineHeight: 1
              }}>›</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

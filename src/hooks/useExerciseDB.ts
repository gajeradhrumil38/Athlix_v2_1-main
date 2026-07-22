import { useState, useEffect } from 'react'

export interface ExerciseDBItem {
  id: string
  name: string
  force: string | null
  level: string
  mechanic: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  category: string
  images: string[]
}

const CACHE_KEY = 'athlix_exercise_db'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

export const useExerciseDB = () => {
  const [exercises, setExercises] = useState<ExerciseDBItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadExercises()
  }, [])

  const loadExercises = async () => {
    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, timestamp } = JSON.parse(cached)
        if (Date.now() - timestamp < CACHE_TTL) {
          setExercises(data)
          setLoading(false)
          return
        }
      }
    } catch(e) {}

    // Fetch fresh
    try {
      const res = await fetch(
        'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
      )
      const data: ExerciseDBItem[] = await res.json()
      setExercises(data)
      // Cache it
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data, timestamp: Date.now()
      }))
    } catch(e) {
      setError('Failed to load exercise database')
      // Fallback to built-in list
      setExercises(FALLBACK_EXERCISES)
    } finally {
      setLoading(false)
    }
  }

  // Search exercises
  const searchExercises = (
    query: string,
    muscleFilter?: string
  ): ExerciseDBItem[] => {
    return exercises.filter(ex => {
      const matchesQuery = query.length === 0 ||
        ex.name.toLowerCase().includes(query.toLowerCase())
      const matchesMuscle = !muscleFilter ||
        ex.primaryMuscles.some(m =>
          m.toLowerCase() === muscleFilter.toLowerCase()
        ) ||
        ex.category.toLowerCase() === muscleFilter.toLowerCase()
      return matchesQuery && matchesMuscle
    }).slice(0, 50) // limit to 50 results
  }

  // Get image URL for an exercise
  const getExerciseImageUrl = (
    exerciseId: string,
    index: 0 | 1 = 0
  ): string => {
    return `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${exerciseId}/${index}.jpg`
  }

  // Map free-exercise-db muscle names to Athlix muscle groups
  const mapToAthlix = (primaryMuscles: string[]): string => {
    const muscle = primaryMuscles[0]?.toLowerCase() || ''
    if (muscle.includes('chest') || muscle.includes('pectoral')) return 'Chest'
    if (muscle.includes('back') || muscle.includes('lat') || muscle.includes('trap')) return 'Back'
    if (muscle.includes('shoulder') || muscle.includes('delt')) return 'Shoulders'
    if (muscle.includes('bicep')) return 'Biceps'
    if (muscle.includes('tricep')) return 'Triceps'
    if (muscle.includes('quad') || muscle.includes('hamstring') || 
        muscle.includes('glute') || muscle.includes('calf') || 
        muscle.includes('leg')) return 'Legs'
    if (muscle.includes('ab') || muscle.includes('core') || 
        muscle.includes('oblique')) return 'Core'
    if (muscle.includes('cardio')) return 'Cardio'
    return 'Other'
  }

  return {
    exercises, loading, error,
    searchExercises,
    getExerciseImageUrl,
    mapToAthlix
  }
}

// Fallback list in case GitHub is unreachable
const FALLBACK_EXERCISES: ExerciseDBItem[] = [
  {
    id: 'Barbell_Bench_Press_-_Medium_Grip',
    name: 'Bench Press',
    force: 'push', level: 'beginner', mechanic: 'compound',
    equipment: 'barbell', primaryMuscles: ['chest'],
    secondaryMuscles: ['shoulders', 'triceps'],
    instructions: [], category: 'strength', images: ['0.jpg', '1.jpg']
  },
  {
    id: 'Barbell_Squat',
    name: 'Squat',
    force: 'push', level: 'beginner', mechanic: 'compound',
    equipment: 'barbell', primaryMuscles: ['quadriceps'],
    secondaryMuscles: ['glutes', 'hamstrings'],
    instructions: [], category: 'strength', images: ['0.jpg', '1.jpg']
  },
  {
    id: 'Deadlift',
    name: 'Deadlift',
    force: 'pull', level: 'beginner', mechanic: 'compound',
    equipment: 'barbell', primaryMuscles: ['hamstrings'],
    secondaryMuscles: ['glutes', 'back'],
    instructions: [], category: 'strength', images: ['0.jpg', '1.jpg']
  },
  {
    id: 'Dumbbell_Bicep_Curl',
    name: 'Bicep Curl',
    force: 'pull', level: 'beginner', mechanic: 'isolation',
    equipment: 'dumbbell', primaryMuscles: ['biceps'],
    secondaryMuscles: ['forearms'],
    instructions: [], category: 'strength', images: ['0.jpg', '1.jpg']
  },
  {
    id: 'Pullup',
    name: 'Pull-Up',
    force: 'pull', level: 'intermediate', mechanic: 'compound',
    equipment: 'body only', primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'middle back'],
    instructions: [], category: 'strength', images: ['0.jpg', '1.jpg']
  },
  {
    id: 'Barbell_Shoulder_Press',
    name: 'Shoulder Press',
    force: 'push', level: 'beginner', mechanic: 'compound',
    equipment: 'barbell', primaryMuscles: ['shoulders'],
    secondaryMuscles: ['triceps'],
    instructions: [], category: 'strength', images: ['0.jpg', '1.jpg']
  },
]

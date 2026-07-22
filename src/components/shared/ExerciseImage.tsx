import React, { useEffect, useState } from 'react'
import {
  OPENTRAINING_ASSETS_BY_ID,
  OPENTRAINING_ID_BY_NAME,
  normalizeExerciseName,
} from '../../data/opentrainingCatalog'
import { ENABLE_EXERCISE_SVG } from '../../config/media'

interface ExerciseImageProps {
  exerciseId: string
  exerciseName: string
  muscleGroup?: string
  size?: 'sm' | 'md' | 'lg'
  showToggle?: boolean  // tap to see movement
}

// Muscle group → accent color for fallback
export const MUSCLE_COLORS: Record<string, string> = {
  Chest: '#C45A7A', Back: '#1A9A80', Shoulders: '#0094B3',
  Biceps: '#5A9E3A', Triceps: '#4A7A2A', Legs: '#2A6090',
  Core: 'var(--accent)', Cardio: '#4FC3F7', Other: '#3A5060'
}

const SIZE_MAP = {
  sm: { container: 40, fontSize: 9 },
  md: { container: 56, fontSize: 11 },
  lg: { container: 80, fontSize: 13 }
}

export const ExerciseImage: React.FC<ExerciseImageProps> = ({
  exerciseId, exerciseName, muscleGroup = 'Other',
  size = 'md', showToggle = false
}) => {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [frameIndex, setFrameIndex] = useState<0 | 1>(0)

  const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
  const openTrainingId =
    (exerciseId && OPENTRAINING_ASSETS_BY_ID[exerciseId] ? exerciseId : null) ||
    OPENTRAINING_ID_BY_NAME[normalizeExerciseName(exerciseName)] ||
    null
  const openTrainingAsset = openTrainingId ? OPENTRAINING_ASSETS_BY_ID[openTrainingId] : null
  const openTrainingImage = openTrainingAsset
    ? openTrainingAsset.images[Math.min(frameIndex, openTrainingAsset.images.length - 1)]
    : null
  const rasterUrl = openTrainingImage
    ? `/assets/opentraining/${openTrainingImage}`
    : exerciseId
      ? `${BASE}${exerciseId}/${frameIndex}.jpg`
      : ''
  const svgVariant = openTrainingImage
    ? openTrainingImage.replace(/\.(png|gif|jpg|jpeg)$/i, '.svg')
    : ''
  const svgUrl = svgVariant
    ? `/assets/opentraining/${svgVariant}`
    : ''
  const remoteUrl = !openTrainingAsset && exerciseId
    ? `${BASE}${exerciseId}/${frameIndex}.jpg`
    : ''
  const imgUrl = ENABLE_EXERCISE_SVG
    ? (svgUrl || rasterUrl || remoteUrl)
    : (rasterUrl || remoteUrl)
  const color = MUSCLE_COLORS[muscleGroup] || MUSCLE_COLORS.Other
  const { container, fontSize } = SIZE_MAP[size]

  useEffect(() => {
    setLoaded(false)
    setError(false)
  }, [exerciseId, exerciseName, frameIndex, svgUrl, rasterUrl, remoteUrl])

  const handleTap = () => {
    if (showToggle) {
      setFrameIndex(prev => prev === 0 ? 1 : 0)
      setLoaded(false) // show loading on switch
    }
  }

  return (
    <div
      onClick={handleTap}
      style={{
        width: container, height: container,
        borderRadius: size === 'lg' ? 14 : 10,
        overflow: 'hidden',
        background: `${color}18`,
        border: `0.5px solid ${color}33`,
        position: 'relative',
        cursor: showToggle ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      {/* Colored letter fallback — shows while loading or on error */}
      {(!loaded || error || !imgUrl) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          background: `${color}18`,
          fontSize, fontWeight: 700,
          color, userSelect: 'none'
        }}>
          {exerciseName.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Actual image */}
      {!error && imgUrl && (
        <img
          src={imgUrl}
          alt={exerciseName}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            // Dark tint overlay to match app theme
            filter: 'brightness(0.85) contrast(1.1)',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.25s ease',
            display: 'block',
          }}
        />
      )}

      {/* Tap hint for toggle */}
      {showToggle && loaded && !error && imgUrl && (
        <div style={{
          position: 'absolute', bottom: 2, right: 2,
          fontSize: 7, color: 'white',
          background: 'rgba(0,0,0,.5)',
          borderRadius: 3, padding: '1px 3px'
        }}>
          {frameIndex === 0 ? '▶' : '⏸'}
        </div>
      )}
    </div>
  )
}

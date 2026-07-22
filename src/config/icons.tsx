import React from 'react'
import {
  Home, Calendar, FileText, Activity, Plus,
  Search, Check, X, ChevronLeft, ChevronRight, ChevronDown,
  TrendingUp, Settings, MoreHorizontal, History,
  ClipboardList, Footprints, Utensils, Sparkles,
  Dumbbell, Loader2,
} from 'lucide-react'

// Central registry of all UI icons used in the app
export const ICONS = {
  Home,
  Calendar,
  Log: FileText,
  Activity,
  Plus,
  Search,
  Check,
  Close: X,
  Back: ChevronLeft,
  Forward: ChevronRight,
  Trending: TrendingUp,
  Settings,
  More: MoreHorizontal,
  History,
  Clipboard: ClipboardList,
  Run: Footprints,
  Food: Utensils,
  Skincare: Sparkles,
  AICoach: Sparkles,
  CreateExercise: Dumbbell,
  ExpandDown: ChevronDown,
  Spinner: Loader2,
}

export type IconName = keyof typeof ICONS

// Standardized sizes for different contexts
export const ICON_SIZE = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32
}

// Wrapper component to enforce consistent styling
interface AppIconProps {
  name: IconName
  size?: keyof typeof ICON_SIZE
  color?: string
  className?: string
  strokeWidth?: number
}

export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 'md',
  color = 'currentColor',
  className = '',
  strokeWidth = 1.75,
}) => {
  const IconComponent = ICONS[name]

  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in registry.`)
    return null
  }

  return (
    <IconComponent
      size={ICON_SIZE[size]}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
    />
  )
}

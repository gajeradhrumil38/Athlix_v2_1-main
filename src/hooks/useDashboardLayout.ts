import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_LAYOUT } from '../config/widgets'
import { getDashboardLayout, saveDashboardLayout } from '../lib/supabaseData'

export interface LayoutItem {
  id: string
  visible: boolean
  order: number
}

export const useDashboardLayout = () => {
  const { user } = useAuth()
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT)
  const [loading, setLoading] = useState(true)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    if (!user) {
      setLayout(DEFAULT_LAYOUT)
      setLoading(false)
      setIsDirty(false)
      return
    }
    setLoading(true)
    fetchLayout()
  }, [user])

  const fetchLayout = async () => {
    try {
      const savedLayout = await getDashboardLayout(user!.id)

      if (savedLayout && Array.isArray(savedLayout)) {
        // Merge with DEFAULT_LAYOUT to handle new widgets
        // added after user saved their layout
        const saved = savedLayout as LayoutItem[]
        const savedIds = saved.map(s => s.id)
        const newWidgets = DEFAULT_LAYOUT.filter(
          d => !savedIds.includes(d.id)
        )

        let merged = [...saved]
        const maxOrder = Math.max(...saved.map(s => s.order), 0)

        newWidgets.forEach((w, i) => {
          if (w.id === 'weekly_goal') {
            const quickStatsIndex = merged.findIndex(s => s.id === 'quick_stats')
            if (quickStatsIndex !== -1) {
              merged.splice(quickStatsIndex + 1, 0, { ...w, order: merged[quickStatsIndex].order + 0.5 })
            } else {
              merged.push({ ...w, order: maxOrder + i + 1 })
            }
          } else {
            merged.push({ ...w, order: maxOrder + i + 1 })
          }
        })

        merged = merged.sort((a, b) => a.order - b.order).map((m, i) => ({ ...m, order: i + 1 }))

        setLayout(merged)
      }
    } catch (err) {
      console.warn('Failed to load dashboard layout, using default:', err)
      setLayout(DEFAULT_LAYOUT)
    } finally {
      setLoading(false)
    }
  }

  const saveLayout = useCallback(async () => {
    if (!user) return
    await saveDashboardLayout(user.id, layout as typeof DEFAULT_LAYOUT)
    setIsDirty(false)
  }, [user, layout])

  const reorderWidgets = useCallback((newOrder: LayoutItem[]) => {
    const reindexed = newOrder.map((item, i) => ({
      ...item, order: i + 1
    }))
    setLayout(reindexed)
    setIsDirty(true)
  }, [])

  const toggleWidget = useCallback((id: string) => {
    setLayout(prev => prev.map(item =>
      item.id === id ? { ...item, visible: !item.visible } : item
    ))
    setIsDirty(true)
  }, [])

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT)
    setIsDirty(true)
  }, [])

  // Ordered visible widgets for home page
  const visibleWidgets = layout
    .filter(l => l.visible)
    .sort((a, b) => a.order - b.order)
    .map(l => l.id)

  return {
    layout, loading, isDirty,
    visibleWidgets,
    saveLayout, reorderWidgets,
    toggleWidget, resetLayout
  }
}

import React from 'react'
import {
  DndContext, closestCenter, PointerSensor,
  TouchSensor, useSensor, useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ALL_WIDGETS } from '../config/widgets'
import { useDashboardLayout, LayoutItem } from '../hooks/useDashboardLayout'
import { useNavigate } from 'react-router-dom'

const SortableRow: React.FC<{ item: LayoutItem; onToggle: (id: string) => void }> = ({ item, onToggle }) => {
  const widget = ALL_WIDGETS.find(w => w.id === item.id)
  if (!widget) return null

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : item.visible ? 1 : 0.38,
      }}
      className="flex items-center gap-3 px-4 py-3.5"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="touch-none flex-shrink-0 cursor-grab active:cursor-grabbing"
        style={{ color: 'var(--text-muted)', lineHeight: 1, fontSize: 16 }}
        aria-label="Drag to reorder"
      >
        ⠿
      </button>

      {/* Name */}
      <span
        className="flex-1 text-[13px] font-medium"
        style={{ color: item.visible ? 'var(--text-primary)' : 'var(--text-muted)' }}
      >
        {widget.name}
        {!widget.canHide && (
          <span className="ml-2 text-[9px] font-semibold" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            always on
          </span>
        )}
      </span>

      {/* Toggle */}
      <button
        onClick={() => widget.canHide && onToggle(item.id)}
        disabled={!widget.canHide}
        className="flex-shrink-0 w-10 h-5.5 rounded-full relative transition-colors"
        style={{
          background: item.visible ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
          opacity: widget.canHide ? 1 : 0.3,
          cursor: widget.canHide ? 'pointer' : 'not-allowed',
          width: 36,
          height: 20,
        }}
        aria-label={item.visible ? 'Hide' : 'Show'}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
          style={{ left: item.visible ? 16 : 2 }}
        />
      </button>
    </div>
  )
}

export const DashboardLayoutEditor: React.FC = () => {
  const navigate = useNavigate()
  const { layout, isDirty, loading, saveLayout, reorderWidgets, toggleWidget, resetLayout } = useDashboardLayout()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = layout.findIndex(l => l.id === active.id)
    const newIndex = layout.findIndex(l => l.id === over.id)
    reorderWidgets(arrayMove(layout, oldIndex, newIndex))
    try { navigator.vibrate(10) } catch { /* ignore */ }
  }

  const handleSave = async () => {
    await saveLayout()
    navigate(-1)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    )
  }

  const visibleItems = layout.filter(l => l.visible).sort((a, b) => a.order - b.order)
  const hiddenItems = layout.filter(l => !l.visible)

  return (
    <div className="min-h-screen pb-16" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-40 flex items-center justify-between px-4 py-3.5"
        style={{ background: 'var(--bg-base)', borderBottom: '0.5px solid var(--border)' }}
      >
        <button onClick={() => navigate(-1)} className="text-[13px]" style={{ color: 'var(--accent)' }}>
          ‹ Back
        </button>
        <span className="text-[14px] font-semibold">Layout</span>
        <button
          onClick={isDirty ? handleSave : () => navigate(-1)}
          className="text-[13px] font-semibold px-3 py-1 rounded-lg"
          style={{
            background: isDirty ? 'var(--accent)' : 'transparent',
            color: isDirty ? '#000' : 'var(--text-muted)',
          }}
        >
          {isDirty ? 'Save' : 'Done'}
        </button>
      </div>

      {/* Hint */}
      <p className="px-4 pt-4 pb-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Hold <span style={{ color: 'var(--text-secondary)' }}>⠿</span> to reorder · toggle to show or hide
      </p>

      {/* Visible */}
      <div
        className="mx-4 rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {visibleItems.map((item, idx) => (
              <div key={item.id} style={{ borderBottom: idx < visibleItems.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                <SortableRow item={item} onToggle={toggleWidget} />
              </div>
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Hidden */}
      {hiddenItems.length > 0 && (
        <>
          <p className="px-4 pt-5 pb-2 text-[10px] font-semibold tracking-widest" style={{ color: 'var(--text-muted)' }}>
            HIDDEN
          </p>
          <div
            className="mx-4 rounded-2xl overflow-hidden"
            style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}
          >
            {hiddenItems.map((item, idx) => (
              <div key={item.id} style={{ borderBottom: idx < hiddenItems.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
                <SortableRow item={item} onToggle={toggleWidget} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Reset */}
      <button
        onClick={resetLayout}
        className="w-full text-center mt-6 text-[11px]"
        style={{ color: 'var(--text-muted)' }}
      >
        Reset to default
      </button>
    </div>
  )
}

export interface WidgetConfig {
  id: string
  name: string
  description: string
  icon: string
  defaultVisible: boolean
  canHide: boolean      // some widgets are mandatory
  defaultOrder: number
}

export const ALL_WIDGETS: WidgetConfig[] = [
  {
    id: 'date_navigator',
    name: 'Date Navigator',
    description: 'Week switcher + Day/Week/Month toggle',
    icon: 'date_navigator',
    defaultVisible: true,
    canHide: false,       // always visible, cant remove
    defaultOrder: 1
  },
  {
    id: 'weekly_goal',
    name: 'Weekly Goal',
    description: 'Weekly training progress chart',
    icon: 'weekly_goal',
    defaultVisible: true,
    canHide: true,
    defaultOrder: 3
  },
  {
    id: 'muscle_map',
    name: 'Muscle Map',
    description: 'Weekly training heatmap',
    icon: 'muscle_map',
    defaultVisible: true,
    canHide: true,
    defaultOrder: 4
  },
  {
    id: 'train_next',
    name: 'Train Next',
    description: 'AI-based session suggestion',
    icon: 'train_next',
    defaultVisible: true,
    canHide: true,
    defaultOrder: 5
  },
  {
    id: 'pr_banner',
    name: 'PR Banner',
    description: 'New personal records this week',
    icon: 'pr_banner',
    defaultVisible: true,
    canHide: true,
    defaultOrder: 6
  },
  {
    id: 'today_card',
    name: "Today's Workout",
    description: 'Current session status + actions',
    icon: 'today_card',
    defaultVisible: true,
    canHide: true,
    defaultOrder: 7
  },
  {
    id: 'week_strip',
    name: 'Week Strip',
    description: 'Mon–Sun day pills with workout dots',
    icon: 'week_strip',
    defaultVisible: true,
    canHide: true,
    defaultOrder: 8
  },
  {
    id: 'ai_summary',
    name: 'AI Weekly Summary',
    description: 'Claude-generated weekly insight',
    icon: 'ai_summary',
    defaultVisible: true,
    canHide: true,
    defaultOrder: 9
  },
  {
    id: 'whoop_row',
    name: 'Device Data',
    description: 'Recovery · HRV · Sleep · Strain from your wearable',
    icon: 'whoop_row',
    defaultVisible: true,
    canHide: true,
    defaultOrder: 10
  },
]

export const DEFAULT_LAYOUT = ALL_WIDGETS.map(w => ({
  id: w.id,
  visible: w.defaultVisible,
  order: w.defaultOrder
}))

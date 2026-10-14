export type ReadingStatus = 'unread' | 'in_progress' | 'completed'

export type ScheduleGroupMode = 'testament-week' | 'month'

export type ScheduleMeta = {
  id: string
  title: string
  description?: string
  dayCount: number
  groupMode: ScheduleGroupMode
  source?: string
}

export type ScheduleCatalog = {
  defaultId: string
  schedules: ScheduleMeta[]
}

export type ScheduleItem = {
  day: number
  range: string
  weekday?: string
  testament?: string
  week?: number
  month?: number
  monthDay?: number
}

export type DayProgress = {
  status: ReadingStatus
  updatedAt: string
}

export type ProgressStore = {
  version: number
  progress: Record<string, DayProgress>
  lastReadDay: number | null
}

export type Verse = {
  chapter: number
  verse: number
  text: string
  abbr: string
  /** True on the first verse of each CSV reading_range segment (comma part). */
  segmentStart?: boolean
}

export type BibleBook = {
  abbr: string
  file: string
  chapters: Record<string, Record<string, string>>
}

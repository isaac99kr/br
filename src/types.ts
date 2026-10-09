export type ReadingStatus = 'unread' | 'in_progress' | 'completed'

export type ScheduleItem = {
  day: number
  weekday: string
  testament: '구약' | '신약' | string
  week: number
  range: string
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
}

export type BibleBook = {
  abbr: string
  file: string
  chapters: Record<string, Record<string, string>>
}

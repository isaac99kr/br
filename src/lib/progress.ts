import type { DayProgress, ProgressStore, ReadingStatus } from '../types'

/** @deprecated Use progressStorageKey(scheduleId). Kept for v1 migration. */
export const STORAGE_KEY = 'bibleReadingProgress:v1'

const DEFAULT_LEGACY_SCHEDULE_ID = 'chrono-246'

const EMPTY: ProgressStore = {
  version: 1,
  progress: {},
  lastReadDay: null,
}

export function progressStorageKey(scheduleId: string): string {
  return `bibleReadingProgress:v2:${scheduleId}`
}

function isStatus(v: unknown): v is ReadingStatus {
  return v === 'unread' || v === 'in_progress' || v === 'completed'
}

/** Migrate prototype / v1 payload into formal schema, clamping to totalDays. */
function migrate(raw: unknown, totalDays: number): ProgressStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY, progress: {} }

  const obj = raw as Record<string, unknown>
  const maxDay = Math.max(1, totalDays)

  if (typeof obj.version === 'number' && obj.progress && typeof obj.progress === 'object') {
    const progress: Record<string, DayProgress> = {}
    for (const [k, v] of Object.entries(obj.progress as Record<string, unknown>)) {
      if (!/^\d+$/.test(k)) continue
      const day = Number(k)
      if (day < 1 || day > maxDay) continue
      if (v && typeof v === 'object' && isStatus((v as DayProgress).status)) {
        progress[k] = {
          status: (v as DayProgress).status,
          updatedAt:
            typeof (v as DayProgress).updatedAt === 'string'
              ? (v as DayProgress).updatedAt
              : new Date().toISOString(),
        }
      } else if (isStatus(v)) {
        progress[k] = { status: v, updatedAt: new Date().toISOString() }
      }
    }
    const last =
      typeof obj.lastReadDay === 'number' && obj.lastReadDay >= 1 && obj.lastReadDay <= maxDay
        ? obj.lastReadDay
        : null
    return { version: 1, progress, lastReadDay: last }
  }

  // Flat prototype map
  const progress: Record<string, DayProgress> = {}
  let looksFlat = false
  for (const [k, v] of Object.entries(obj)) {
    if (!/^\d+$/.test(k)) continue
    looksFlat = true
    if (isStatus(v)) {
      const day = Number(k)
      if (day < 1 || day > maxDay) continue
      progress[k] = { status: v, updatedAt: new Date().toISOString() }
    }
  }
  if (looksFlat) return { version: 1, progress, lastReadDay: null }

  return { ...EMPTY, progress: {} }
}

function readRaw(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/** One-time copy of v1 progress into chrono-246 v2 key when v2 is empty. */
function migrateV1IfNeeded(scheduleId: string, totalDays: number): ProgressStore | null {
  if (scheduleId !== DEFAULT_LEGACY_SCHEDULE_ID) return null
  const v2Key = progressStorageKey(scheduleId)
  if (localStorage.getItem(v2Key)) return null
  const legacy = readRaw(STORAGE_KEY)
  if (legacy == null) return null
  const migrated = migrate(legacy, totalDays)
  try {
    localStorage.setItem(v2Key, JSON.stringify(migrated))
  } catch {
    // ignore
  }
  return migrated
}

export function loadProgress(scheduleId: string, totalDays: number): ProgressStore {
  const migrated = migrateV1IfNeeded(scheduleId, totalDays)
  if (migrated) return migrated

  const raw = readRaw(progressStorageKey(scheduleId))
  if (raw == null) return { ...EMPTY, progress: {} }
  return migrate(raw, totalDays)
}

export function saveProgress(scheduleId: string, store: ProgressStore): void {
  try {
    localStorage.setItem(progressStorageKey(scheduleId), JSON.stringify(store))
  } catch {
    // private mode / quota — keep in-memory only
  }
}

export function getStatus(store: ProgressStore, day: number): ReadingStatus {
  const item = store.progress[String(day)]
  if (!item || !isStatus(item.status)) return 'unread'
  return item.status
}

export function statusLabel(status: ReadingStatus): string {
  if (status === 'completed') return '완료'
  if (status === 'in_progress') return '읽기 시작'
  return '안읽음'
}

export function countCompleted(store: ProgressStore, total: number): number {
  let n = 0
  for (let d = 1; d <= total; d++) {
    if (getStatus(store, d) === 'completed') n++
  }
  return n
}

export function withStatus(
  store: ProgressStore,
  day: number,
  status: ReadingStatus,
): ProgressStore {
  const next: ProgressStore = {
    version: 1,
    lastReadDay: store.lastReadDay,
    progress: { ...store.progress },
  }
  if (status === 'unread') {
    delete next.progress[String(day)]
  } else {
    next.progress[String(day)] = {
      status,
      updatedAt: new Date().toISOString(),
    }
  }
  return next
}

export function withLastRead(store: ProgressStore, day: number): ProgressStore {
  return { ...store, lastReadDay: day }
}

/** Mark days 1 .. untilDayExclusive-1 as completed. */
export function withCompletedThrough(
  store: ProgressStore,
  untilDayExclusive: number,
): ProgressStore {
  const last = Math.max(1, untilDayExclusive) - 1
  if (last < 1) return store
  const now = new Date().toISOString()
  const progress = { ...store.progress }
  for (let d = 1; d <= last; d++) {
    progress[String(d)] = { status: 'completed', updatedAt: now }
  }
  return { version: 1, lastReadDay: store.lastReadDay, progress }
}

/**
 * True when some day before `day` was never started (unread).
 * in_progress / completed count as already handled — do not re-prompt.
 */
export function hasIncompleteBefore(store: ProgressStore, day: number): boolean {
  for (let d = 1; d < day; d++) {
    if (getStatus(store, d) === 'unread') return true
  }
  return false
}

/** Clear all completed days back to unread (keeps in_progress and lastReadDay). */
export function withClearedCompleted(store: ProgressStore): ProgressStore {
  const progress: Record<string, DayProgress> = {}
  for (const [k, v] of Object.entries(store.progress)) {
    if (v.status !== 'completed') progress[k] = v
  }
  return { version: 1, lastReadDay: store.lastReadDay, progress }
}

export function resumeDay(store: ProgressStore, totalDays: number): number {
  if (store.lastReadDay && store.lastReadDay >= 1 && store.lastReadDay <= totalDays) {
    return store.lastReadDay
  }
  return 1
}

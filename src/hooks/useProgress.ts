import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countCompleted,
  getStatus,
  hasIncompleteBefore,
  loadProgress,
  resumeDay,
  saveProgress,
  withClearedCompleted,
  withCompletedThrough,
  withLastRead,
  withStatus,
} from '../lib/progress'
import type { ProgressStore, ReadingStatus } from '../types'

export function useProgress(scheduleId: string, totalDays: number) {
  const [store, setStore] = useState<ProgressStore>(() => loadProgress(scheduleId, totalDays))
  const activeScheduleId = useRef(scheduleId)

  useEffect(() => {
    if (activeScheduleId.current !== scheduleId) {
      activeScheduleId.current = scheduleId
      setStore(loadProgress(scheduleId, totalDays))
      return
    }
    saveProgress(scheduleId, store)
  }, [scheduleId, totalDays, store])

  const statusOf = useCallback((day: number) => getStatus(store, day), [store])

  const setDayStatus = useCallback((day: number, status: ReadingStatus) => {
    setStore((prev) => withStatus(prev, day, status))
  }, [])

  const markOpened = useCallback((day: number) => {
    setStore((prev) => {
      let next = withLastRead(prev, day)
      const cur = getStatus(next, day)
      if (cur === 'unread') {
        next = withStatus(next, day, 'in_progress')
      }
      return next
    })
  }, [])

  const completeDaysBefore = useCallback(
    (day: number) => {
      setStore((prev) => {
        const next = withCompletedThrough(prev, day)
        // Persist immediately so a quick navigate does not lose bulk-complete.
        saveProgress(scheduleId, next)
        return next
      })
    },
    [scheduleId],
  )

  const clearAllCompleted = useCallback(() => {
    setStore((prev) => withClearedCompleted(prev))
  }, [])

  const needsBulkCompleteBefore = useCallback(
    (day: number) => hasIncompleteBefore(store, day),
    [store],
  )

  const completedCount = countCompleted(store, totalDays)
  const percent = totalDays ? Math.round((completedCount / totalDays) * 100) : 0
  const continueDay = resumeDay(store, totalDays)

  return {
    store,
    statusOf,
    setDayStatus,
    markOpened,
    completeDaysBefore,
    clearAllCompleted,
    needsBulkCompleteBefore,
    completedCount,
    percent,
    continueDay,
    lastReadDay: store.lastReadDay,
  }
}

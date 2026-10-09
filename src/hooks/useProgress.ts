import { useCallback, useEffect, useState } from 'react'
import {
  countCompleted,
  getStatus,
  loadProgress,
  resumeDay,
  saveProgress,
  withLastRead,
  withStatus,
} from '../lib/progress'
import type { ProgressStore, ReadingStatus } from '../types'

export function useProgress(totalDays = 246) {
  const [store, setStore] = useState<ProgressStore>(() => loadProgress())

  useEffect(() => {
    saveProgress(store)
  }, [store])

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

  const completedCount = countCompleted(store, totalDays)
  const percent = totalDays ? Math.round((completedCount / totalDays) * 100) : 0
  const continueDay = resumeDay(store)

  return {
    store,
    statusOf,
    setDayStatus,
    markOpened,
    completedCount,
    percent,
    continueDay,
    lastReadDay: store.lastReadDay,
  }
}

import type { ScheduleItem } from '../types'

const BASE = import.meta.env.BASE_URL

let cache: ScheduleItem[] | null = null

export async function loadSchedule(): Promise<ScheduleItem[]> {
  if (cache) return cache
  const res = await fetch(`${BASE}data/schedule.json`)
  if (!res.ok) throw new Error('일정을 불러오지 못했습니다.')
  const data = (await res.json()) as ScheduleItem[]
  if (!Array.isArray(data) || data.length !== 246) {
    throw new Error(`일정 수가 올바르지 않습니다: ${Array.isArray(data) ? data.length : 'invalid'}`)
  }
  cache = data
  return data
}

export function getItem(schedule: ScheduleItem[], day: number): ScheduleItem | undefined {
  return schedule.find((x) => x.day === day)
}

export function groupByTestamentWeek(schedule: ScheduleItem[]) {
  const order = ['구약', '신약'] as const
  const result: { testament: string; weeks: { week: number; days: ScheduleItem[] }[] }[] = []
  for (const testament of order) {
    const items = schedule.filter((x) => x.testament === testament)
    const weekNos = [...new Set(items.map((x) => x.week))].sort((a, b) => a - b)
    result.push({
      testament,
      weeks: weekNos.map((week) => ({
        week,
        days: items.filter((x) => x.week === week),
      })),
    })
  }
  return result
}

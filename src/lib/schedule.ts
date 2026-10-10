import type { ScheduleCatalog, ScheduleItem, ScheduleMeta } from '../types'

const BASE = import.meta.env.BASE_URL

let catalogCache: ScheduleCatalog | null = null
const scheduleCache = new Map<string, ScheduleItem[]>()

function assertContiguousDays(data: ScheduleItem[], id: string): void {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`일정 수가 올바르지 않습니다: ${id}`)
  }
  for (let i = 0; i < data.length; i++) {
    if (data[i]?.day !== i + 1) {
      throw new Error(`일정 번호가 올바르지 않습니다: ${id} (expected day ${i + 1})`)
    }
  }
}

export async function loadScheduleCatalog(): Promise<ScheduleCatalog> {
  if (catalogCache) return catalogCache
  const res = await fetch(`${BASE}data/schedules.json`)
  if (!res.ok) throw new Error('일정 목록을 불러오지 못했습니다.')
  const data = (await res.json()) as ScheduleCatalog
  if (!data?.schedules?.length || typeof data.defaultId !== 'string') {
    throw new Error('일정 목록 형식이 올바르지 않습니다.')
  }
  catalogCache = data
  return data
}

export function getScheduleMeta(
  catalog: ScheduleCatalog,
  scheduleId: string,
): ScheduleMeta | undefined {
  return catalog.schedules.find((s) => s.id === scheduleId)
}

export function resolveScheduleId(catalog: ScheduleCatalog, preferredId: string | null | undefined): string {
  if (preferredId && catalog.schedules.some((s) => s.id === preferredId)) {
    return preferredId
  }
  if (catalog.schedules.some((s) => s.id === catalog.defaultId)) {
    return catalog.defaultId
  }
  return catalog.schedules[0].id
}

export async function loadSchedule(scheduleId: string): Promise<ScheduleItem[]> {
  const cached = scheduleCache.get(scheduleId)
  if (cached) return cached
  const res = await fetch(`${BASE}data/schedules/${encodeURIComponent(scheduleId)}.json`)
  if (!res.ok) throw new Error(`일정을 불러오지 못했습니다: ${scheduleId}`)
  const data = (await res.json()) as ScheduleItem[]
  assertContiguousDays(data, scheduleId)
  scheduleCache.set(scheduleId, data)
  return data
}

export function getItem(schedule: ScheduleItem[], day: number): ScheduleItem | undefined {
  return schedule.find((x) => x.day === day)
}

export function formatScheduleDayLabel(item: ScheduleItem): string {
  if (item.month != null && item.monthDay != null) {
    return `${item.month}월 ${item.monthDay}일`
  }
  return `${item.day}일차`
}

export function groupByTestamentWeek(schedule: ScheduleItem[]) {
  const order = ['구약', '신약'] as const
  const result: { testament: string; weeks: { week: number; days: ScheduleItem[] }[] }[] = []
  for (const testament of order) {
    const items = schedule.filter((x) => x.testament === testament)
    const weekNos = [...new Set(items.map((x) => x.week).filter((w): w is number => w != null))].sort(
      (a, b) => a - b,
    )
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

export function groupByMonth(schedule: ScheduleItem[]) {
  const months = [...new Set(schedule.map((x) => x.month).filter((m): m is number => m != null))].sort(
    (a, b) => a - b,
  )
  return months.map((month) => ({
    month,
    days: schedule.filter((x) => x.month === month),
  }))
}

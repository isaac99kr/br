import { useEffect, useMemo, useState } from 'react'
import { groupByTestamentWeek } from '../lib/schedule'
import { statusLabel } from '../lib/progress'
import type { ScheduleItem } from '../types'
import type { useProgress } from '../hooks/useProgress'

type ProgressApi = ReturnType<typeof useProgress>

type Props = {
  schedule: ScheduleItem[]
  progress: ProgressApi
  onOpenReader: (day: number) => void
}

type TestamentFilter = '전체' | '구약' | '신약'

export function FindPage({ schedule, progress, onOpenReader }: Props) {
  const [testamentFilter, setTestamentFilter] = useState<TestamentFilter>('전체')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)

  const grouped = useMemo(() => groupByTestamentWeek(schedule), [schedule])

  const visible = useMemo(() => {
    return grouped
      .filter((g) => testamentFilter === '전체' || g.testament === testamentFilter)
      .map((g) => ({
        ...g,
        weeks: g.weeks
          .map((w) => ({
            ...w,
            days: w.days.filter((d) => {
              if (!onlyIncomplete) return true
              return progress.statusOf(d.day) !== 'completed'
            }),
          }))
          .filter((w) => w.days.length > 0),
      }))
      .filter((g) => g.weeks.length > 0)
  }, [grouped, testamentFilter, onlyIncomplete, progress])

  useEffect(() => {
    const target = progress.continueDay
    const id = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-day="${target}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [progress.continueDay, testamentFilter, onlyIncomplete, visible])

  return (
    <main className="page">
      <h2 className="section-title">읽을 날짜 찾기</h2>
      <p className="section-desc">주차별로 일정을 보고 날짜를 누르면 바로 읽을 수 있어요.</p>

      <div className="filters" role="group" aria-label="일정 필터">
        {(['전체', '구약', '신약'] as TestamentFilter[]).map((t) => (
          <button
            key={t}
            type="button"
            className={testamentFilter === t ? 'pill active' : 'pill'}
            onClick={() => setTestamentFilter(t)}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          className={onlyIncomplete ? 'pill active' : 'pill'}
          onClick={() => setOnlyIncomplete((v) => !v)}
        >
          미완료만
        </button>
        {progress.completedCount > 0 && (
          <button
            type="button"
            className="pill"
            onClick={() => {
              const ok = window.confirm(
                `완료로 표시된 ${progress.completedCount}일을 모두 안읽음으로 되돌릴까요?`,
              )
              if (ok) progress.clearAllCompleted()
            }}
          >
            일괄 완료 해제
          </button>
        )}
      </div>

      <div id="schedule">
        {visible.length === 0 && <div className="empty">표시할 일정이 없습니다.</div>}
        {visible.map((g) => (
          <section key={g.testament} className="book-group">
            <div className="book-head">
              <h3>{g.testament}</h3>
              <span className="week-meta">{g.weeks.length}주차 표시</span>
            </div>
            {g.weeks.map((w) => {
              const allInWeek = schedule.filter(
                (x) => x.testament === g.testament && x.week === w.week,
              )
              const done = allInWeek.filter((x) => progress.statusOf(x.day) === 'completed').length
              return (
                <div key={w.week} className="week">
                  <div className="week-head">
                    <span className="week-name">{w.week}주차</span>
                    <span className="week-meta">
                      {done}/{allInWeek.length} 완료
                    </span>
                  </div>
                  <div className="days">
                    {w.days.map((d) => {
                      const s = progress.statusOf(d.day)
                      const cls =
                        s === 'completed' ? 'day done' : s === 'in_progress' ? 'day current' : 'day'
                      return (
                        <button
                          key={d.day}
                          type="button"
                          className={cls}
                          data-day={d.day}
                          title={`${d.day}일차 ${d.range} · ${statusLabel(s)}`}
                          onClick={() => onOpenReader(d.day)}
                        >
                          <span className="num">{d.day}</span>
                          <span className="abbr">{d.range}</span>
                          <span className="state">
                            {s === 'completed' ? '✓ 완료' : statusLabel(s)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </main>
  )
}

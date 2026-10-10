import { useEffect, useMemo, useState } from 'react'
import { groupByMonth, groupByTestamentWeek } from '../lib/schedule'
import { statusLabel } from '../lib/progress'
import type { ScheduleItem, ScheduleMeta } from '../types'
import type { useProgress } from '../hooks/useProgress'

type ProgressApi = ReturnType<typeof useProgress>

type Props = {
  schedule: ScheduleItem[]
  scheduleMeta: ScheduleMeta
  progress: ProgressApi
  onOpenReader: (day: number) => void
}

type TestamentFilter = '전체' | '구약' | '신약'

function DayButton({
  day,
  label,
  range,
  status,
  onOpen,
}: {
  day: number
  label: string
  range: string
  status: ReturnType<ProgressApi['statusOf']>
  onOpen: (day: number) => void
}) {
  const cls = status === 'completed' ? 'day done' : status === 'in_progress' ? 'day current' : 'day'
  return (
    <button
      type="button"
      className={cls}
      data-day={day}
      title={`${label} ${range} · ${statusLabel(status)}`}
      onClick={() => onOpen(day)}
    >
      <span className="num">{label}</span>
      <span className="abbr">{range}</span>
      <span className="state">{status === 'completed' ? '✓ 완료' : statusLabel(status)}</span>
    </button>
  )
}

export function FindPage({ schedule, scheduleMeta, progress, onOpenReader }: Props) {
  const [testamentFilter, setTestamentFilter] = useState<TestamentFilter>('전체')
  const [monthFilter, setMonthFilter] = useState<number | '전체'>('전체')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)

  const byWeek = useMemo(() => groupByTestamentWeek(schedule), [schedule])
  const byMonth = useMemo(() => groupByMonth(schedule), [schedule])

  const weekVisible = useMemo(() => {
    return byWeek
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
  }, [byWeek, testamentFilter, onlyIncomplete, progress])

  const monthVisible = useMemo(() => {
    return byMonth
      .filter((g) => monthFilter === '전체' || g.month === monthFilter)
      .map((g) => ({
        ...g,
        days: g.days.filter((d) => {
          if (!onlyIncomplete) return true
          return progress.statusOf(d.day) !== 'completed'
        }),
      }))
      .filter((g) => g.days.length > 0)
  }, [byMonth, monthFilter, onlyIncomplete, progress])

  useEffect(() => {
    const target = progress.continueDay
    const id = window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-day="${target}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [progress.continueDay, testamentFilter, monthFilter, onlyIncomplete, weekVisible, monthVisible])

  const desc =
    scheduleMeta.groupMode === 'month'
      ? '월별로 일정을 보고 날짜를 누르면 바로 읽을 수 있어요.'
      : '주차별로 일정을 보고 날짜를 누르면 바로 읽을 수 있어요.'

  return (
    <main className="page">
      <h2 className="section-title">읽을 날짜 찾기</h2>
      <p className="section-desc">
        {scheduleMeta.title} · {desc}
      </p>

      <div className="filters" role="group" aria-label="일정 필터">
        {scheduleMeta.groupMode === 'month' ? (
          <>
            <button
              type="button"
              className={monthFilter === '전체' ? 'pill active' : 'pill'}
              onClick={() => setMonthFilter('전체')}
            >
              전체
            </button>
            {byMonth.map((g) => (
              <button
                key={g.month}
                type="button"
                className={monthFilter === g.month ? 'pill active' : 'pill'}
                onClick={() => setMonthFilter(g.month)}
              >
                {g.month}월
              </button>
            ))}
          </>
        ) : (
          (['전체', '구약', '신약'] as TestamentFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              className={testamentFilter === t ? 'pill active' : 'pill'}
              onClick={() => setTestamentFilter(t)}
            >
              {t}
            </button>
          ))
        )}
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
        {scheduleMeta.groupMode === 'month' ? (
          <>
            {monthVisible.length === 0 && <div className="empty">표시할 일정이 없습니다.</div>}
            {monthVisible.map((g) => {
              const allInMonth = schedule.filter((x) => x.month === g.month)
              const done = allInMonth.filter((x) => progress.statusOf(x.day) === 'completed').length
              return (
                <section key={g.month} className="book-group">
                  <div className="book-head">
                    <h3>{g.month}월</h3>
                    <span className="week-meta">
                      {done}/{allInMonth.length} 완료
                    </span>
                  </div>
                  <div className="week">
                    <div className="days">
                      {g.days.map((d) => (
                        <DayButton
                          key={d.day}
                          day={d.day}
                          label={
                            d.monthDay != null ? `${d.month}/${d.monthDay}` : String(d.day)
                          }
                          range={d.range}
                          status={progress.statusOf(d.day)}
                          onOpen={onOpenReader}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              )
            })}
          </>
        ) : (
          <>
            {weekVisible.length === 0 && <div className="empty">표시할 일정이 없습니다.</div>}
            {weekVisible.map((g) => (
              <section key={g.testament} className="book-group">
                <div className="book-head">
                  <h3>{g.testament}</h3>
                  <span className="week-meta">{g.weeks.length}주차 표시</span>
                </div>
                {g.weeks.map((w) => {
                  const allInWeek = schedule.filter(
                    (x) => x.testament === g.testament && x.week === w.week,
                  )
                  const done = allInWeek.filter(
                    (x) => progress.statusOf(x.day) === 'completed',
                  ).length
                  return (
                    <div key={w.week} className="week">
                      <div className="week-head">
                        <span className="week-name">{w.week}주차</span>
                        <span className="week-meta">
                          {done}/{allInWeek.length} 완료
                        </span>
                      </div>
                      <div className="days">
                        {w.days.map((d) => (
                          <DayButton
                            key={d.day}
                            day={d.day}
                            label={String(d.day)}
                            range={d.range}
                            status={progress.statusOf(d.day)}
                            onOpen={onOpenReader}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}
          </>
        )}
      </div>
    </main>
  )
}

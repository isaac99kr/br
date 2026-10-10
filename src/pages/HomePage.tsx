import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatScheduleDayLabel, getItem } from '../lib/schedule'
import type { ScheduleItem, ScheduleMeta } from '../types'
import type { useProgress } from '../hooks/useProgress'

type ProgressApi = ReturnType<typeof useProgress>

type Props = {
  schedule: ScheduleItem[]
  scheduleMeta: ScheduleMeta
  scheduleOptions: ScheduleMeta[]
  scheduleId: string
  onScheduleChange: (id: string) => void
  progress: ProgressApi
  onOpenReader: (day: number) => void
}

export function HomePage({
  schedule,
  scheduleMeta,
  scheduleOptions,
  scheduleId,
  onScheduleChange,
  progress,
  onOpenReader,
}: Props) {
  const total = schedule.length
  const { completedCount, percent, continueDay } = progress
  const item = getItem(schedule, continueDay)
  const allDone = completedCount === total && total > 0
  const [scheduleOpen, setScheduleOpen] = useState(false)

  useEffect(() => {
    if (scheduleOpen) {
      document.body.classList.add('settings-overlay-open')
    } else {
      document.body.classList.remove('settings-overlay-open')
    }
    return () => document.body.classList.remove('settings-overlay-open')
  }, [scheduleOpen])

  const nextLabel = item
    ? `${formatScheduleDayLabel(item)} · ${item.range}`
    : '첫 번째 일정부터 시작해보세요.'

  return (
    <main className="page">
      <section className="panel">
        <div className="home-plan-row">
          <div className="home-plan-info">
            <div className="eyebrow">읽기 일정</div>
            <div className="home-plan-title">{scheduleMeta.title}</div>
          </div>
          <button type="button" className="pill" onClick={() => setScheduleOpen(true)}>
            스케줄 설정
          </button>
        </div>

        <div className="progress-head">
          <div>
            <div className="big">
              <span>{completedCount}</span>
              <span className="muted unit"> / {total}일</span>
            </div>
            <div className="muted small">완료한 읽기</div>
          </div>
          <div className="big percent">{percent}%</div>
        </div>
        <div className="bar" aria-hidden="true">
          <div className="fill" style={{ width: `${percent}%` }} />
        </div>

        <button type="button" className="continue" onClick={() => onOpenReader(continueDay)}>
          {allDone ? '✓ 모두 읽었어요' : '▶ 이어 읽기'}
        </button>
        <div className="nextline">{nextLabel}</div>

        <div className="home-actions">
          <Link to="/find" className="pill link-pill">
            날짜 찾기 →
          </Link>
        </div>
      </section>

      {scheduleOpen && (
        <div
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="스케줄 설정"
        >
          <button
            type="button"
            className="settings-overlay-backdrop"
            aria-label="닫기"
            onClick={() => setScheduleOpen(false)}
          />
          <div className="settings-overlay-sheet">
            <main className="settings-panel">
              <div className="settings-back">
                <button type="button" className="pill" onClick={() => setScheduleOpen(false)}>
                  닫기
                </button>
              </div>
              <h2 className="section-title">스케줄 설정</h2>
              <p className="section-desc">읽을 일정을 고르세요. 진행 상황은 일정별로 따로 저장됩니다.</p>
              <section className="panel">
                <div className="eyebrow">읽기 일정</div>
                <div className="font-size-options" role="radiogroup" aria-label="읽기 일정">
                  {scheduleOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={scheduleId === opt.id}
                      className={scheduleId === opt.id ? 'font-opt active' : 'font-opt'}
                      onClick={() => {
                        onScheduleChange(opt.id)
                        setScheduleOpen(false)
                      }}
                    >
                      <span className="font-opt-label">{opt.title}</span>
                      <span className="font-opt-sample">
                        {opt.description || `${opt.dayCount}일`}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </main>
          </div>
        </div>
      )}
    </main>
  )
}

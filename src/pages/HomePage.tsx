import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { copyText } from '../lib/copy'
import { statusLabel } from '../lib/progress'
import { getItem } from '../lib/schedule'
import { formatShareClipboard } from '../lib/share'
import type { ScheduleItem } from '../types'
import type { useProgress } from '../hooks/useProgress'

type ProgressApi = ReturnType<typeof useProgress>

type Props = {
  schedule: ScheduleItem[]
  progress: ProgressApi
  onOpenReader: (day: number) => void
}

export function HomePage({ schedule, progress, onOpenReader }: Props) {
  const total = schedule.length
  const { completedCount, percent, continueDay, statusOf } = progress
  const item = getItem(schedule, continueDay)
  const status = statusOf(continueDay)
  const allDone = completedCount === total && total > 0
  const hasHistory = progress.lastReadDay != null || completedCount > 0 || status !== 'unread'
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  const handleShare = async () => {
    const ok = await copyText(formatShareClipboard('246일 성경 읽기 — 진행 확인과 이어 읽기', '/'))
    setToast(ok ? '링크를 복사했어요' : '복사에 실패했습니다')
  }

  return (
    <main className="page">
      <section className="panel">
        <div className="eyebrow">MY READING PROGRESS</div>
        <div className="progress-head">
          <div>
            <div className="big">
              <span>{completedCount}</span>
              <span className="muted unit"> / {total}일</span>
            </div>
            <div className="muted small">완료한 읽기 일정</div>
          </div>
          <div className="big percent">{percent}%</div>
        </div>
        <div className="bar" aria-hidden="true">
          <div className="fill" style={{ width: `${percent}%` }} />
        </div>
        <button type="button" className="continue" onClick={() => onOpenReader(continueDay)}>
          {allDone ? '✓ 모두 읽었어요' : '▶ 이어 읽기'}
        </button>
        <div className="nextline">
          {item
            ? `다음 읽기: ${item.day}일차 · ${item.range}`
            : '첫 번째 읽기 일정부터 시작해보세요.'}
        </div>
        {completedCount > 0 && (
          <button
            type="button"
            className="pill link-pill clear-completed"
            onClick={() => {
              const ok = window.confirm(
                `완료로 표시된 ${completedCount}일을 모두 안읽음으로 되돌릴까요?`,
              )
              if (ok) progress.clearAllCompleted()
            }}
          >
            일괄 완료 해제
          </button>
        )}
      </section>

      <section className="panel">
        <div className="eyebrow">RECENT / NEXT</div>
        {hasHistory && item ? (
          <>
            <h2 className="resume-title">
              {item.day}일차 · {item.range}
            </h2>
            <p className="muted">
              {item.testament} {item.week}주차 · {statusLabel(status)}
            </p>
          </>
        ) : (
          <>
            <h2 className="resume-title">첫 읽기를 시작해보세요</h2>
            <p className="muted">날짜 찾기에서 읽을 날짜를 선택할 수 있어요.</p>
          </>
        )}
        <div className="home-actions">
          <Link to="/find" className="pill link-pill">
            날짜 찾기 →
          </Link>
          <button type="button" className="pill link-pill" onClick={handleShare}>
            공유
          </button>
        </div>
      </section>
      {toast && <div className="toast page-toast">{toast}</div>}
    </main>
  )
}

import { useEffect, useRef, useState } from 'react'
import { loadVersesForRange } from '../lib/bible'
import { statusLabel } from '../lib/progress'
import { getItem } from '../lib/schedule'
import type { ScheduleItem, Verse } from '../types'
import type { useProgress } from '../hooks/useProgress'

type ProgressApi = ReturnType<typeof useProgress>

type Props = {
  day: number | null
  schedule: ScheduleItem[]
  progress: ProgressApi
  onClose: () => void
  onChangeDay: (day: number) => void
}

export function ReaderModal({ day, schedule, progress, onClose, onChangeDay }: Props) {
  const item = day != null ? getItem(schedule, day) : undefined
  const [verses, setVerses] = useState<Verse[]>([])
  const [linked, setLinked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const completedRef = useRef(false)

  useEffect(() => {
    if (day == null || !item) return
    progress.markOpened(day)
    completedRef.current = progress.statusOf(day) === 'completed'
    setLoading(true)
    setError(null)
    let cancelled = false
    loadVersesForRange(item.range)
      .then((res) => {
        if (cancelled) return
        setVerses(res.verses)
        setLinked(res.linked)
      })
      .catch(() => {
        if (cancelled) return
        setVerses([])
        setLinked(false)
        setError('본문을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, item?.range])

  useEffect(() => {
    if (!linked || !bodyRef.current) return
    const el = bodyRef.current
    // Only auto-complete when the user scrolls to the end of real scripture.
    // Do not complete immediately on short content that fits the viewport.
    const onScroll = () => {
      if (completedRef.current || day == null) return
      if (el.scrollHeight <= el.clientHeight + 8) return
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
      if (remaining <= 24) {
        completedRef.current = true
        progress.setDayStatus(day, 'completed')
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [linked, verses, day, progress])

  if (day == null || !item) return null

  const status = progress.statusOf(day)
  const weekdayLabel = `${item.weekday}요일`

  return (
    <div className="reader show" role="dialog" aria-modal="true" aria-labelledby="reader-ref">
      <div className="reader-card">
        <div className="reader-top">
          <div className="eyebrow">DAY {item.day}</div>
          <button type="button" className="close" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="reading-ref" id="reader-ref">
          {item.range}
        </div>
        <p className="muted reader-meta">
          {item.testament} · {item.week}주차 · {weekdayLabel} · {statusLabel(status)}
        </p>

        <div className="reader-body" ref={bodyRef}>
          {loading && <p className="muted">본문을 불러오는 중…</p>}
          {error && <p className="muted">{error}</p>}
          {!loading && !error && !linked && (
            <div className="reader-note">
              이 날짜의 읽기 범위는 <strong>{item.range}</strong> 입니다. 본문 데이터를 아직 연결하지
              못했거나 범위 파싱에 실패했습니다. 자동 완료는 적용되지 않습니다.
            </div>
          )}
          {!loading && linked && (
            <div className="verses">
              {verses.map((v) => (
                <p key={`${v.abbr}-${v.chapter}-${v.verse}`} className="verse">
                  <sup>
                    {v.abbr}
                    {v.chapter}:{v.verse}
                  </sup>{' '}
                  {v.text}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="reader-actions">
          <button
            type="button"
            onClick={() => progress.setDayStatus(day, 'in_progress')}
            aria-pressed={status === 'in_progress'}
          >
            {status === 'in_progress' ? '읽기 시작 ✓' : '읽기 시작'}
          </button>
          {status === 'completed' ? (
            <button
              type="button"
              className="primary"
              onClick={() => {
                completedRef.current = false
                progress.setDayStatus(day, 'unread')
              }}
            >
              완료 해제
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => {
                completedRef.current = true
                progress.setDayStatus(day, 'completed')
              }}
            >
              완료 표시 ✓
            </button>
          )}
        </div>
        <div className="reader-actions">
          <button
            type="button"
            disabled={day <= 1}
            onClick={() => onChangeDay(day - 1)}
          >
            ← 이전 날짜
          </button>
          <button
            type="button"
            disabled={day >= schedule.length}
            onClick={() => onChangeDay(day + 1)}
          >
            다음 날짜 →
          </button>
        </div>
      </div>
    </div>
  )
}

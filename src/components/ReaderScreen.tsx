import { Fragment, useEffect, useRef, useState } from 'react'
import { loadVersesForRange } from '../lib/bible'
import { getBookName } from '../lib/bookNames'
import { copyText, formatVersesForCopy } from '../lib/copy'
import { statusLabel } from '../lib/progress'
import { getItem } from '../lib/schedule'
import type { FontSize, SpacingSize, TranslationId } from '../lib/settings'
import { SettingsPage } from '../pages/SettingsPage'
import type { ScheduleItem, Verse } from '../types'
import type { useProgress } from '../hooks/useProgress'

type ProgressApi = ReturnType<typeof useProgress>

type Props = {
  day: number
  schedule: ScheduleItem[]
  progress: ProgressApi
  translationId: TranslationId
  fontSize: FontSize
  verseGap: SpacingSize
  lineHeight: SpacingSize
  onFontSizeChange: (size: FontSize) => void
  onVerseGapChange: (size: SpacingSize) => void
  onLineHeightChange: (size: SpacingSize) => void
  onTranslationChange: (id: TranslationId) => void
  onClose: () => void
  onChangeDay: (day: number) => void
}

function verseKey(v: Verse): string {
  return `${v.abbr}-${v.chapter}-${v.verse}`
}

export function ReaderScreen({
  day,
  schedule,
  progress,
  translationId,
  fontSize,
  verseGap,
  lineHeight,
  onFontSizeChange,
  onVerseGapChange,
  onLineHeightChange,
  onTranslationChange,
  onClose,
  onChangeDay,
}: Props) {
  const item = getItem(schedule, day)
  const [verses, setVerses] = useState<Verse[]>([])
  const [linked, setLinked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chromeHidden, setChromeHidden] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const completedRef = useRef(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    document.documentElement.classList.add('reader-open')
    document.body.classList.add('reader-open')
    window.scrollTo(0, 0)
    lastScrollY.current = 0
    return () => {
      document.documentElement.classList.remove('reader-open')
      document.body.classList.remove('reader-open')
      document.body.classList.remove('settings-overlay-open')
      window.scrollTo(0, 0)
    }
  }, [])

  useEffect(() => {
    if (settingsOpen) {
      document.body.classList.add('settings-overlay-open')
    } else {
      document.body.classList.remove('settings-overlay-open')
    }
    return () => document.body.classList.remove('settings-overlay-open')
  }, [settingsOpen])

  useEffect(() => {
    if (!item) return
    progress.markOpened(day)
    completedRef.current = progress.statusOf(day) === 'completed'
    setSelected(new Set())
    setChromeHidden(false)
    setSettingsOpen(false)
    setLoading(true)
    setError(null)
    window.scrollTo(0, 0)
    lastScrollY.current = 0
    let cancelled = false
    loadVersesForRange(item.range, translationId)
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
  }, [day, item?.range, translationId])

  useEffect(() => {
    lastScrollY.current = window.scrollY

    const onScroll = () => {
      if (document.body.classList.contains('settings-overlay-open')) return

      const top = window.scrollY
      const delta = top - lastScrollY.current
      lastScrollY.current = top

      if (top < 24) {
        setChromeHidden(false)
      } else if (delta > 10) {
        setChromeHidden(true)
      } else if (delta < -10) {
        setChromeHidden(false)
      }

      if (!linked || completedRef.current) return
      const doc = document.documentElement
      if (doc.scrollHeight <= window.innerHeight + 8) return
      const remaining = doc.scrollHeight - window.scrollY - window.innerHeight
      if (remaining <= 24) {
        completedRef.current = true
        progress.setDayStatus(day, 'completed')
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [linked, verses, day, progress])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  if (!item) return null

  const status = progress.statusOf(day)
  const weekdayLabel = `${item.weekday}요일`
  const selectedVerses = verses.filter((v) => selected.has(verseKey(v)))

  const toggleVerse = (v: Verse) => {
    const key = verseKey(v)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setChromeHidden(false)
  }

  const handleCopy = async () => {
    if (!selectedVerses.length) return
    const text = formatVersesForCopy(selectedVerses)
    const ok = await copyText(text)
    setToast(ok ? `${selectedVerses.length}개 구절을 복사했어요` : '복사에 실패했습니다')
  }

  return (
    <div className={`reader-screen${chromeHidden ? ' chrome-hidden' : ''}`}>
      <header className="reader-chrome reader-chrome-top">
        <button type="button" className="reader-icon-btn" onClick={onClose} aria-label="뒤로">
          ←
        </button>
        <div className="reader-chrome-title">
          <div className="reader-day">DAY {item.day}</div>
          <div className="reader-range-short" id="reader-ref" title={item.range}>
            {item.range}
          </div>
        </div>
        <button
          type="button"
          className="reader-icon-btn reader-settings-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="설정"
        >
          설정
        </button>
      </header>

      <div className="reader-scroll">
        <div className="reader-meta-block">
          <p className="reader-meta-line">
            {item.testament} · {item.week}주차 · {weekdayLabel} · {statusLabel(status)}
          </p>
        </div>

        {loading && <p className="reader-status-msg">본문을 불러오는 중…</p>}
        {error && <p className="reader-status-msg">{error}</p>}
        {!loading && !error && !linked && (
          <div className="reader-fallback">
            이 날짜의 읽기 범위는 <strong>{item.range}</strong> 입니다. 본문을 연결하지 못했거나 범위
            파싱에 실패했습니다. 자동 완료는 적용되지 않습니다.
          </div>
        )}
        {!loading && linked && (
          <div className="verses">
            {verses.map((v, i) => {
              const key = verseKey(v)
              const isOn = selected.has(key)
              const prev = i > 0 ? verses[i - 1] : null
              const showBookHeader = !prev || prev.abbr !== v.abbr
              return (
                <Fragment key={key}>
                  {showBookHeader && (
                    <div className="book-header" role="heading" aria-level={2}>
                      {getBookName(v.abbr)} · {v.chapter}장
                    </div>
                  )}
                  <button
                    type="button"
                    className={isOn ? 'verse verse-selected' : 'verse'}
                    onClick={() => toggleVerse(v)}
                    aria-pressed={isOn}
                  >
                    <span className="verse-num">
                      {v.chapter}:{v.verse}
                    </span>
                    <span className="verse-text">{v.text}</span>
                  </button>
                </Fragment>
              )
            })}
          </div>
        )}
        <div className="reader-scroll-end" aria-hidden="true" />
      </div>

      {selected.size > 0 && (
        <div className="copy-bar">
          <span className="copy-count">{selected.size}개 선택</span>
          <button type="button" className="copy-btn" onClick={handleCopy}>
            복사
          </button>
          <button type="button" className="copy-clear" onClick={() => setSelected(new Set())}>
            선택 해제
          </button>
        </div>
      )}

      <footer className="reader-chrome reader-chrome-bottom">
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
          <button type="button" disabled={day <= 1} onClick={() => onChangeDay(day - 1)}>
            ← 이전
          </button>
          <button
            type="button"
            disabled={day >= schedule.length}
            onClick={() => onChangeDay(day + 1)}
          >
            다음 →
          </button>
        </div>
      </footer>

      {toast && <div className="toast">{toast}</div>}

      {settingsOpen && (
        <div
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="설정"
        >
          <button
            type="button"
            className="settings-overlay-backdrop"
            aria-label="설정 닫기"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="settings-overlay-sheet">
            <SettingsPage
              embedded
              fontSize={fontSize}
              verseGap={verseGap}
              lineHeight={lineHeight}
              translationId={translationId}
              onFontSizeChange={onFontSizeChange}
              onVerseGapChange={onVerseGapChange}
              onLineHeightChange={onLineHeightChange}
              onTranslationChange={onTranslationChange}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

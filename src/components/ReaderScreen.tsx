import { Fragment, useEffect, useRef, useState } from 'react'
import { AudioPlayer } from './AudioPlayer'
import {
  findAudioDay,
  loadAudioManifest,
  verseCueKey,
  type AudioChapterCue,
  type AudioVerseCue,
} from '../lib/audio'
import { loadVersesForRange } from '../lib/bible'
import { getBookName } from '../lib/bookNames'
import { copyText, formatVersesForCopy } from '../lib/copy'
import { statusLabel } from '../lib/progress'
import { getItem } from '../lib/schedule'
import { formatDayShareTitle, formatShareClipboard } from '../lib/share'
import type { FontSize, SpacingSize, TranslationId, VoiceGender } from '../lib/settings'
import { SettingsPage } from '../pages/SettingsPage'
import type { ScheduleItem, Verse } from '../types'
import type { useProgress } from '../hooks/useProgress'

type ProgressApi = ReturnType<typeof useProgress>

type Props = {
  day: number
  schedule: ScheduleItem[]
  progress: ProgressApi
  translationId: TranslationId
  voiceGender: VoiceGender
  fontSize: FontSize
  verseGap: SpacingSize
  lineHeight: SpacingSize
  onFontSizeChange: (size: FontSize) => void
  onVerseGapChange: (size: SpacingSize) => void
  onLineHeightChange: (size: SpacingSize) => void
  onTranslationChange: (id: TranslationId) => void
  onVoiceGenderChange: (voice: VoiceGender) => void
  onClose: () => void
  onChangeDay: (day: number) => void
}

function verseKey(v: Verse): string {
  return `${v.abbr}-${v.chapter}-${v.verse}`
}

const CHROME_HIDE_DELAY_MS = 1500
/** Base dwell time per verse at 1x auto-scroll rate. */
const AUTO_SCROLL_BASE_MS = 4000
const AUTO_SCROLL_RATES = [0.75, 1, 1.25, 1.5, 2] as const
type AutoScrollRate = (typeof AUTO_SCROLL_RATES)[number]

function verseToCue(v: Verse): AudioVerseCue {
  return { abbr: v.abbr, chapter: v.chapter, verse: v.verse, startMs: 0 }
}

function findNearestVerseIndex(list: Verse[]): number {
  if (!list.length) return 0
  const centerY = window.innerHeight / 2
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < list.length; i++) {
    const v = list[i]
    const el = document.getElementById(`v-${v.abbr}-${v.chapter}-${v.verse}`)
    if (!el) continue
    const rect = el.getBoundingClientRect()
    const mid = (rect.top + rect.bottom) / 2
    const dist = Math.abs(mid - centerY)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  }
  return best
}

export function ReaderScreen({
  day,
  schedule,
  progress,
  translationId,
  voiceGender,
  fontSize,
  verseGap,
  lineHeight,
  onFontSizeChange,
  onVerseGapChange,
  onLineHeightChange,
  onTranslationChange,
  onVoiceGenderChange,
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
  const [audioOpen, setAudioOpen] = useState(false)
  const [autoScrollOn, setAutoScrollOn] = useState(false)
  const [autoScrollRate, setAutoScrollRate] = useState<AutoScrollRate>(1)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [activeChapter, setActiveChapter] = useState<AudioChapterCue | null>(null)
  const [activeVerse, setActiveVerse] = useState<AudioVerseCue | null>(null)
  const completedRef = useRef(false)
  const lastScrollY = useRef(0)
  const userScrollLock = useRef(0)
  const programScrollLock = useRef(0)
  const chromeHideTimer = useRef<number | null>(null)
  const audioPlayingRef = useRef(false)
  const autoScrollOnRef = useRef(false)
  const autoScrollIndexRef = useRef(0)
  const settingsOpenRef = useRef(settingsOpen)
  settingsOpenRef.current = settingsOpen
  const versesRef = useRef(verses)
  versesRef.current = verses
  const activeVerseRef = useRef(activeVerse)
  activeVerseRef.current = activeVerse
  const lastScrolledVerse = useRef<string | null>(null)
  const lastScrolledChapter = useRef<string | null>(null)

  const clearChromeHideTimer = () => {
    if (chromeHideTimer.current != null) {
      window.clearTimeout(chromeHideTimer.current)
      chromeHideTimer.current = null
    }
  }

  const immersiveActive = () => audioPlayingRef.current || autoScrollOnRef.current

  const scheduleChromeHide = () => {
    clearChromeHideTimer()
    if (settingsOpenRef.current || !immersiveActive()) return
    chromeHideTimer.current = window.setTimeout(() => {
      setChromeHidden(true)
      chromeHideTimer.current = null
    }, CHROME_HIDE_DELAY_MS)
  }

  /** Show chrome; if audio/auto-scroll still active, hide again after a short delay. */
  const revealChrome = () => {
    setChromeHidden(false)
    if (immersiveActive()) scheduleChromeHide()
  }

  const stopAutoScroll = (clearHighlight: boolean) => {
    autoScrollOnRef.current = false
    setAutoScrollOn(false)
    if (clearHighlight && !audioPlayingRef.current) {
      setActiveVerse(null)
    }
    clearChromeHideTimer()
    if (!audioPlayingRef.current) setChromeHidden(false)
  }

  useEffect(() => {
    document.documentElement.classList.add('reader-open')
    document.body.classList.add('reader-open')
    window.scrollTo(0, 0)
    lastScrollY.current = 0
    return () => {
      clearChromeHideTimer()
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
    setAudioOpen(false)
    autoScrollOnRef.current = false
    setAutoScrollOn(false)
    setActiveChapter(null)
    setActiveVerse(null)
    lastScrolledVerse.current = null
    lastScrolledChapter.current = null
    clearChromeHideTimer()
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
    setAudioOpen(false)
    autoScrollOnRef.current = false
    setAutoScrollOn(false)
    setActiveChapter(null)
    setActiveVerse(null)
    lastScrolledVerse.current = null
    lastScrolledChapter.current = null
    clearChromeHideTimer()
    setChromeHidden(false)
  }, [voiceGender])

  useEffect(() => {
    lastScrollY.current = window.scrollY

    const onScroll = () => {
      if (document.body.classList.contains('settings-overlay-open')) return
      if (Date.now() < programScrollLock.current) {
        lastScrollY.current = window.scrollY
        return
      }

      const top = window.scrollY
      const delta = top - lastScrollY.current
      lastScrollY.current = top

      if (autoScrollOnRef.current && Math.abs(delta) > 10) {
        stopAutoScroll(true)
        return
      }

      // While audio/auto-scroll runs, chrome stays hidden until the user taps —
      // ignore scroll toggles (verse auto-scroll would otherwise keep flashing menus).
      if (!immersiveActive()) {
        if (top < 24) {
          setChromeHidden(false)
        } else if (delta > 10) {
          setChromeHidden(true)
        } else if (delta < -10) {
          setChromeHidden(false)
        }
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

  // Pause timer while audio plays; sync index to audio cue when resuming.
  useEffect(() => {
    if (audioPlaying || !autoScrollOn) return
    const cue = activeVerseRef.current
    if (!cue) return
    const idx = versesRef.current.findIndex(
      (v) => v.abbr === cue.abbr && v.chapter === cue.chapter && v.verse === cue.verse,
    )
    if (idx >= 0) autoScrollIndexRef.current = idx
  }, [audioPlaying, autoScrollOn])

  useEffect(() => {
    if (!autoScrollOn || audioPlaying) return

    const intervalMs = Math.max(500, Math.round(AUTO_SCROLL_BASE_MS / autoScrollRate))
    const tick = () => {
      const list = versesRef.current
      const next = autoScrollIndexRef.current + 1
      if (next >= list.length) {
        stopAutoScroll(true)
        return
      }
      autoScrollIndexRef.current = next
      setActiveVerse(verseToCue(list[next]))
    }

    const id = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(id)
  }, [autoScrollOn, audioPlaying, autoScrollRate])

  useEffect(() => {
    if (Date.now() < userScrollLock.current) return

    if (activeVerse) {
      const key = verseCueKey(activeVerse)
      if (key === lastScrolledVerse.current) return
      lastScrolledVerse.current = key
      const id = `v-${activeVerse.abbr}-${activeVerse.chapter}-${activeVerse.verse}`
      const el = document.getElementById(id)
      if (!el) return
      programScrollLock.current = Date.now() + 800
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    if (activeChapter) {
      const key = `${activeChapter.abbr}-${activeChapter.chapter}`
      if (key === lastScrolledChapter.current) return
      lastScrolledChapter.current = key
      const id = `ch-${activeChapter.abbr}-${activeChapter.chapter}`
      const el = document.getElementById(id)
      if (!el) return
      programScrollLock.current = Date.now() + 800
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [activeVerse, activeChapter])

  if (!item) return null

  const status = progress.statusOf(day)
  const selectedVerses = verses.filter((v) => selected.has(verseKey(v)))

  const toggleVerse = (v: Verse) => {
    // First tap while chrome is hidden only reveals menus (no verse select).
    if (chromeHidden) {
      revealChrome()
      return
    }
    if (autoScrollOnRef.current) stopAutoScroll(true)
    userScrollLock.current = Date.now() + 2500
    const key = verseKey(v)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    revealChrome()
  }

  const closeAudioPanel = () => {
    setAudioOpen(false)
    audioPlayingRef.current = false
    setAudioPlaying(false)
    setActiveChapter(null)
    setActiveVerse(null)
    lastScrolledVerse.current = null
    lastScrolledChapter.current = null
  }

  const handleAutoScrollToggle = () => {
    if (autoScrollOn) {
      stopAutoScroll(true)
      return
    }
    if (!linked || !verses.length) return
    if (audioOpen) closeAudioPanel()
    const idx = findNearestVerseIndex(verses)
    autoScrollIndexRef.current = idx
    setActiveVerse(verseToCue(verses[idx]))
    autoScrollOnRef.current = true
    setAutoScrollOn(true)
    clearChromeHideTimer()
    scheduleChromeHide()
  }

  const handleCopy = async () => {
    if (!selectedVerses.length) return
    const text = formatVersesForCopy(selectedVerses)
    const ok = await copyText(text)
    setToast(ok ? `${selectedVerses.length}개 구절을 복사했어요` : '복사에 실패했습니다')
  }

  const handleShare = async () => {
    if (!item) return
    const text = formatShareClipboard(formatDayShareTitle(item.day, item.range), `/read/${day}`)
    const ok = await copyText(text)
    setToast(ok ? '링크를 복사했어요' : '복사에 실패했습니다')
  }

  const handleListenClick = async () => {
    if (audioOpen) {
      closeAudioPanel()
      clearChromeHideTimer()
      setChromeHidden(false)
      return
    }
    const manifest = await loadAudioManifest()
    const found = findAudioDay(manifest, translationId, voiceGender, day)
    if (!found) {
      setToast('준비중입니다')
      return
    }
    if (autoScrollOnRef.current) stopAutoScroll(true)
    setAudioOpen(true)
  }

  const handlePlayingChange = (playing: boolean) => {
    audioPlayingRef.current = playing
    setAudioPlaying(playing)
    clearChromeHideTimer()
    if (playing) {
      scheduleChromeHide()
    } else {
      setChromeHidden(false)
    }
  }

  const handleReaderSurfaceTap = () => {
    if (!chromeHidden) return
    revealChrome()
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
        <div className="reader-chrome-actions">
          <button
            type="button"
            className="reader-icon-btn reader-settings-btn"
            onClick={handleShare}
            aria-label="공유"
          >
            공유
          </button>
          <button
            type="button"
            className="reader-icon-btn reader-settings-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="설정"
          >
            설정
          </button>
        </div>
      </header>

      <div className="reader-scroll" onClick={handleReaderSurfaceTap} role="presentation">
        <div className="reader-meta-block">
          <p className="reader-meta-line">
            {item.testament} · {item.week}주차 · {statusLabel(status)}
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
              const showBookHeader =
                !prev || prev.abbr !== v.abbr || prev.chapter !== v.chapter
              const chapterActive =
                activeChapter?.abbr === v.abbr && activeChapter.chapter === v.chapter
              const verseActive =
                activeVerse?.abbr === v.abbr &&
                activeVerse.chapter === v.chapter &&
                activeVerse.verse === v.verse
              return (
                <Fragment key={key}>
                  {showBookHeader && (
                    <div
                      id={`ch-${v.abbr}-${v.chapter}`}
                      className={chapterActive ? 'book-header book-header-active' : 'book-header'}
                      role="heading"
                      aria-level={2}
                    >
                      {getBookName(v.abbr)} · {v.chapter}장
                    </div>
                  )}
                  <button
                    type="button"
                    id={`v-${v.abbr}-${v.chapter}-${v.verse}`}
                    className={[
                      'verse',
                      isOn ? 'verse-selected' : '',
                      verseActive ? 'verse-listening' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => toggleVerse(v)}
                    aria-pressed={isOn}
                  >
                    <span className="verse-num">{v.verse}</span>
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
        {audioOpen && (
          <AudioPlayer
            day={day}
            translationId={translationId}
            voiceGender={voiceGender}
            verses={verses}
            onActiveChapter={setActiveChapter}
            onActiveVerse={setActiveVerse}
            onPlayingChange={handlePlayingChange}
            onUnavailable={(message) => setToast(message)}
          />
        )}
        {autoScrollOn && (
          <div className="auto-scroll-controls">
            <label className="audio-rate">
              <span className="audio-rate-label">속도</span>
              <select
                value={autoScrollRate}
                onChange={(e) => {
                  setAutoScrollRate(Number(e.target.value) as AutoScrollRate)
                  revealChrome()
                }}
                aria-label="자동스크롤 속도"
              >
                {AUTO_SCROLL_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}x
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="reader-actions">
          <button
            type="button"
            className={autoScrollOn ? 'primary' : undefined}
            aria-pressed={autoScrollOn}
            disabled={!linked || loading || !verses.length}
            onClick={handleAutoScrollToggle}
          >
            {autoScrollOn ? '자동스크롤 ✓' : '자동스크롤'}
          </button>
          <button
            type="button"
            className={audioOpen ? 'primary' : undefined}
            aria-pressed={audioOpen}
            onClick={() => {
              void handleListenClick()
            }}
          >
            {audioOpen ? '음성듣기 ✓' : '음성듣기'}
          </button>
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
              voiceGender={voiceGender}
              onFontSizeChange={onFontSizeChange}
              onVerseGapChange={onVerseGapChange}
              onLineHeightChange={onLineHeightChange}
              onTranslationChange={onTranslationChange}
              onVoiceGenderChange={onVoiceGenderChange}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

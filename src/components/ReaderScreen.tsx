import { Fragment, useEffect, useRef, useState } from 'react'
import { AudioPlayer, type TtsStartAt } from './AudioPlayer'
import { NewAudioPlayer } from './NewAudioPlayer'
import { type AudioChapterCue, type AudioVerseCue } from '../lib/audio'
import { loadChapters } from '../lib/chapterAudio'
import { buildAudioQueue, type AudioQueue } from '../lib/audioQueue'
import {
  TTS_UNSUPPORTED_MESSAGE,
  isSpeechSynthesisSupported,
  loadKoreanVoices,
} from '../lib/browserTts'
import { loadVersesForRange } from '../lib/bible'
import { getBookName } from '../lib/bookNames'
import { copyText, formatVersesForCopy } from '../lib/copy'
import { statusLabel } from '../lib/progress'
import { formatScheduleDayLabel, getItem } from '../lib/schedule'
import { formatDayShareTitle, formatShareClipboard } from '../lib/share'
import type { FontSize, SpacingSize, TranslationId } from '../lib/settings'
import { SettingsPage } from '../pages/SettingsPage'
import type { ScheduleItem, ScheduleMeta, Verse } from '../types'
import type { useProgress } from '../hooks/useProgress'

type ProgressApi = ReturnType<typeof useProgress>

type Props = {
  collection?: boolean
  day: number
  schedule: ScheduleItem[]
  scheduleMeta: ScheduleMeta
  progress: ProgressApi
  translationId: TranslationId
  ttsVoiceUri: string | null
  onTtsVoiceUriChange: (uri: string | null) => void
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

const CHROME_HIDE_DELAY_MS = 1500
/** Time to scroll one CSS line at 1x. */
const LINE_SCROLL_BASE_MS = 1200
const AUTO_SCROLL_RATES = [0.75, 1, 1.25, 1.5, 2] as const
type AutoScrollRate = (typeof AUTO_SCROLL_RATES)[number]

function verseToCue(v: Verse): AudioVerseCue {
  return { abbr: v.abbr, chapter: v.chapter, verse: v.verse, startMs: 0 }
}

function getLineHeightPx(): number {
  const el = document.querySelector('.reader-scroll')
  if (!el) return 28
  const lh = parseFloat(getComputedStyle(el).lineHeight)
  if (Number.isFinite(lh) && lh > 0) return lh
  const fs = parseFloat(getComputedStyle(el).fontSize) || 16
  return fs * 1.8
}

function findNearestVerseIndex(list: Verse[]): number {
  if (!list.length) return 0
  const centerY = window.innerHeight / 2
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < list.length; i++) {
    const v = list[i]
    const el = document.getElementById(`v-${v.abbr}-${v.chapter}-${v.verse}-${i}`)
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
  collection = false,
  day,
  schedule,
  scheduleMeta,
  progress,
  translationId,
  ttsVoiceUri,
  onTtsVoiceUriChange,
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
  const [rangeOpen, setRangeOpen] = useState(false)
  const [audioOpen, setAudioOpen] = useState(false)
  const [newAudioEntry, setNewAudioEntry] = useState<AudioQueue | null>(null)
  const audioRequest = useRef<AbortController | null>(null)
  const audioActionVersion = useRef(0)
  const [newAudioLoading, setNewAudioLoading] = useState(false)
  useEffect(() => {
    return () => { audioRequest.current?.abort(); audioActionVersion.current++ }
  }, [day, item?.range, translationId])
  const [ttsStartAt, setTtsStartAt] = useState<TtsStartAt | null>(null)
  const [autoScrollOn, setAutoScrollOn] = useState(false)
  const [autoScrollRate, setAutoScrollRate] = useState<AutoScrollRate>(1)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioRate, setAudioRate] = useState(1)
  const [activeChapter, setActiveChapter] = useState<AudioChapterCue | null>(null)
  const [activeVerse, setActiveVerse] = useState<AudioVerseCue | null>(null)
  const completedRef = useRef(false)
  const lastScrollY = useRef(0)
  const userScrollLock = useRef(0)
  const programScrollLock = useRef(0)
  const chromeHideTimer = useRef<number | null>(null)
  const readerScreenRef = useRef<HTMLDivElement | null>(null)
  const footerRef = useRef<HTMLElement | null>(null)
  const audioPlayingRef = useRef(false)
  const autoScrollOnRef = useRef(false)
  const autoScrollRateRef = useRef<AutoScrollRate>(1)
  autoScrollRateRef.current = autoScrollRate
  const audioRateRef = useRef(1)
  audioRateRef.current = audioRate
  const settingsOpenRef = useRef(settingsOpen)
  settingsOpenRef.current = settingsOpen
  const rangeOpenRef = useRef(rangeOpen)
  rangeOpenRef.current = rangeOpen
  const overlayOpen = settingsOpen || rangeOpen
  const versesRef = useRef(verses)
  versesRef.current = verses
  const activeVerseRef = useRef(activeVerse)
  activeVerseRef.current = activeVerse

  const clearChromeHideTimer = () => {
    if (chromeHideTimer.current != null) {
      window.clearTimeout(chromeHideTimer.current)
      chromeHideTimer.current = null
    }
  }

  const immersiveActive = () => audioPlayingRef.current || autoScrollOnRef.current

  const scheduleChromeHide = () => {
    clearChromeHideTimer()
    if (settingsOpenRef.current || rangeOpenRef.current || !immersiveActive()) return
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
    if (overlayOpen) {
      document.body.classList.add('settings-overlay-open')
    } else {
      document.body.classList.remove('settings-overlay-open')
    }
    return () => document.body.classList.remove('settings-overlay-open')
  }, [overlayOpen])

  useEffect(() => {
    if (!rangeOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRangeOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rangeOpen])

  useEffect(() => {
    if (!item) return
    progress.markOpened(day)
    completedRef.current = progress.statusOf(day) === 'completed'
    setSelected(new Set())
    setChromeHidden(false)
    setSettingsOpen(false)
    setRangeOpen(false)
    setAudioOpen(false)
    setNewAudioEntry(null)
    setTtsStartAt(null)
    autoScrollOnRef.current = false
    setAutoScrollOn(false)
    setAudioRate(1)
    setActiveChapter(null)
    setActiveVerse(null)
    clearChromeHideTimer()
    setLoading(true)
    setError(null)
    window.scrollTo(0, 0)
    lastScrollY.current = 0
    let cancelled = false
    loadVersesForRange(item.range, translationId, collection)
      .then((res) => {
        if (cancelled) return
        setVerses(res.verses)
        setLinked(res.linked)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setVerses([])
        setLinked(false)
        setError(cause instanceof Error ? cause.message : '본문을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, item?.range, translationId])

  // Scroll chapter announce / listening verse into view (browser TTS cue).
  useEffect(() => {
    if (!audioPlaying) return
    let id: string | null = null
    if (activeChapter?.announce && activeChapter.verseIndex != null) {
      id = `ch-${activeChapter.abbr}-${activeChapter.chapter}-${activeChapter.verseIndex}`
    } else if (activeVerse) {
      const index = activeVerse.verseIndex ?? verses.findIndex(v => v.abbr === activeVerse.abbr && v.chapter === activeVerse.chapter && v.verse === activeVerse.verse)
      id = `v-${activeVerse.abbr}-${activeVerse.chapter}-${activeVerse.verse}-${index}`
    }
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    programScrollLock.current = Date.now() + 400
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeVerse, activeChapter, audioPlaying])

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

      // While audio/auto-scroll runs, chrome stays hidden until the user taps —
      // ignore scroll toggles (line scroll would otherwise keep flashing menus).
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

    // Distinguish user intent from programmatic line scroll.
    const onUserScrollIntent = () => {
      if (!autoScrollOnRef.current) return
      if (Date.now() < userScrollLock.current) return
      stopAutoScroll(true)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', onUserScrollIntent, { passive: true })
    window.addEventListener('touchmove', onUserScrollIntent, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', onUserScrollIntent)
      window.removeEventListener('touchmove', onUserScrollIntent)
    }
  }, [linked, verses, day, progress])

  // Keep copy-bar / content padding above the real footer height (audio panel grows).
  useEffect(() => {
    const screen = readerScreenRef.current
    const footer = footerRef.current
    if (!screen || !footer) return

    const apply = () => {
      const h = Math.ceil(footer.getBoundingClientRect().height)
      screen.style.setProperty('--reader-chrome-bottom-h', `${h}px`)
    }

    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(footer)
    return () => {
      ro.disconnect()
      screen.style.removeProperty('--reader-chrome-bottom-h')
    }
  }, [audioOpen, newAudioEntry, autoScrollOn, chromeHidden])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  // Constant-speed line scroll for auto-scroll only (TTS uses verse scroll above).
  useEffect(() => {
    const shouldRun = autoScrollOn && !audioPlaying
    if (!shouldRun) return

    let raf = 0
    let last = performance.now()
    let leftover = 0
    let highlightAcc = 0

    const frame = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now

      const rate = audioPlayingRef.current
        ? audioRateRef.current
        : autoScrollRateRef.current
      const linePx = getLineHeightPx()
      const pxPerMs = (linePx * Math.max(0.25, rate)) / LINE_SCROLL_BASE_MS
      leftover += pxPerMs * dt

      const doc = document.documentElement
      const maxScroll = Math.max(0, doc.scrollHeight - window.innerHeight)
      if (window.scrollY >= maxScroll - 1) {
        leftover = 0
        if (autoScrollOnRef.current && !audioPlayingRef.current) {
          stopAutoScroll(true)
          return
        }
      } else if (leftover >= 0.5) {
        const step = leftover
        leftover = 0
        programScrollLock.current = Date.now() + 80
        window.scrollBy(0, step)
        lastScrollY.current = window.scrollY
      }

      if (autoScrollOnRef.current && !audioPlayingRef.current) {
        highlightAcc += dt
        if (highlightAcc >= 200) {
          highlightAcc = 0
          const list = versesRef.current
          if (list.length) {
            const v = list[findNearestVerseIndex(list)]
            const cue = verseToCue(v)
            const cur = activeVerseRef.current
            if (
              !cur ||
              cur.abbr !== cue.abbr ||
              cur.chapter !== cue.chapter ||
              cur.verse !== cue.verse
            ) {
              setActiveVerse(cue)
            }
          }
        }
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [autoScrollOn, audioPlaying, autoScrollRate, audioRate])

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
    if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel()
    setAudioOpen(false)
    setTtsStartAt(null)
    audioPlayingRef.current = false
    setAudioPlaying(false)
    setAudioRate(1)
    setActiveChapter(null)
    setActiveVerse(null)
  }

  const closeNewAudioPanel = () => {
    setNewAudioEntry(null)
    audioPlayingRef.current = false
    setAudioPlaying(false)
    setAudioRate(1)
    setActiveChapter(null)
    setActiveVerse(null)
  }

  const handleAutoScrollToggle = () => {
    audioRequest.current?.abort()
    audioActionVersion.current++
    if (autoScrollOn) {
      stopAutoScroll(true)
      return
    }
    if (!linked || !verses.length) return
    if (audioOpen) closeAudioPanel()
    if (newAudioEntry) closeNewAudioPanel()
    const idx = findNearestVerseIndex(verses)
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

  const handleListenFromSelected = async () => {
    audioRequest.current?.abort()
    const actionVersion = ++audioActionVersion.current
    if (!selectedVerses.length) return
    // Reading order: first selected verse in the day's verse list
    const first = verses.find((v) => selected.has(verseKey(v)))
    if (!first) return

    if (!isSpeechSynthesisSupported()) {
      setToast(TTS_UNSUPPORTED_MESSAGE)
      return
    }
    const voices = await loadKoreanVoices()
    if (actionVersion !== audioActionVersion.current) return
    if (!voices.length) {
      setToast(TTS_UNSUPPORTED_MESSAGE)
      return
    }
    if (!linked || !verses.length) {
      setToast('본문을 불러온 뒤 다시 시도해 주세요')
      return
    }
    if (autoScrollOnRef.current) stopAutoScroll(true)
    if (newAudioEntry) closeNewAudioPanel()

    const next: TtsStartAt = {
      abbr: first.abbr,
      chapter: first.chapter,
      verse: first.verse,
      nonce: Date.now(),
    }
    setSelected(new Set())
    setAudioOpen(true)
    setTtsStartAt(next)
  }

  const handleShare = async () => {
    if (!item) return
    const text = formatShareClipboard(
      collection ? `모아읽기 · ${item.range}` : formatDayShareTitle(formatScheduleDayLabel(item), item.range),
      collection ? `/collection/read?range=${encodeURIComponent(item.range)}` : `/read/${day}`,
    )
    const ok = await copyText(text)
    setToast(ok ? '링크를 복사했어요' : '복사에 실패했습니다')
  }

  const handleListenClick = async () => {
    audioRequest.current?.abort()
    const actionVersion = ++audioActionVersion.current
    if (audioOpen) {
      closeAudioPanel()
      if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel()
      clearChromeHideTimer()
      setChromeHidden(false)
      return
    }
    if (!isSpeechSynthesisSupported()) {
      setToast(TTS_UNSUPPORTED_MESSAGE)
      return
    }
    const voices = await loadKoreanVoices()
    if (actionVersion !== audioActionVersion.current) return
    if (!voices.length) {
      setToast(TTS_UNSUPPORTED_MESSAGE)
      return
    }
    if (!linked || !verses.length) {
      setToast('본문을 불러온 뒤 다시 시도해 주세요')
      return
    }
    if (autoScrollOnRef.current) stopAutoScroll(true)
    if (newAudioEntry) closeNewAudioPanel()
    setAudioOpen(true)
  }

  const handleNewAudioClick = async () => {
    audioActionVersion.current++
    if (newAudioEntry) {
      closeNewAudioPanel()
      clearChromeHideTimer()
      setChromeHidden(false)
      return
    }
    if (!linked || !verses.length) {
      setToast('본문을 불러온 뒤 다시 시도해 주세요')
      return
    }
    if (newAudioLoading) return
    audioRequest.current?.abort()
    const request = new AbortController()
    audioRequest.current = request
    setNewAudioLoading(true)
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      request.abort()
    }, 20_000)
    try {
      const chapters = await loadChapters(translationId, verses, request.signal)
      if (request.signal.aborted) return
      const queue = buildAudioQueue(translationId, verses, chapters)
      if (autoScrollOnRef.current) stopAutoScroll(true)
      if (audioOpen) closeAudioPanel()
      setNewAudioEntry(queue)
    } catch (cause) {
      if (audioRequest.current === request) {
        if (timedOut) setToast('음원 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.')
        else if (!request.signal.aborted) setToast(cause instanceof Error ? cause.message : '음원을 불러오지 못했습니다.')
      }
    } finally {
      window.clearTimeout(timeout)
      if (audioRequest.current === request) {
        audioRequest.current = null
        setNewAudioLoading(false)
      }
    }
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
    <div
      ref={readerScreenRef}
      className={`reader-screen${chromeHidden ? ' chrome-hidden' : ''}`}
    >
      <header className="reader-chrome reader-chrome-top">
        <button type="button" className="reader-icon-btn" onClick={onClose} aria-label="뒤로">
          ←
        </button>
        <div className="reader-chrome-title">
          <div className="reader-day">
            {collection ? '모아읽기' : item.month != null && item.monthDay != null
              ? `${item.month}월 ${item.monthDay}일`
              : `DAY ${item.day}`}
          </div>
          <button
            type="button"
            className="reader-range-short"
            id="reader-ref"
            title={item.range}
            aria-haspopup="dialog"
            aria-expanded={rangeOpen}
            aria-controls="reader-range-dialog"
            onClick={() => setRangeOpen(true)}
          >
            {item.range}
          </button>
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
            {collection ? '모아읽기' : item.month != null && item.monthDay != null
              ? `${scheduleMeta.title} · ${item.day}일차 · ${statusLabel(status)}`
              : `${item.testament ?? scheduleMeta.title}${
                  item.week != null ? ` · ${item.week}주차` : ''
                } · ${statusLabel(status)}`}
          </p>
        </div>

        {loading && <p className="reader-status-msg">본문을 불러오는 중…</p>}
        {error && <p className="reader-status-msg">{error}</p>}
        {!loading && !error && !linked && (
          <div className="reader-fallback">
            읽기 범위는 <strong>{item.range}</strong> 입니다. 본문을 연결하지 못했거나 범위
            파싱에 실패했습니다. 자동 완료는 적용되지 않습니다.
          </div>
        )}
        {!loading && linked && (
          <div className="verses">
            {verses.map((v, i) => {
              const key = verseKey(v)
              // Index in key: same ref can appear again after a later segment jump.
              const listKey = `${key}@${i}`
              const isOn = selected.has(key)
              const prev = i > 0 ? verses[i - 1] : null
              // New book/chapter, or a new schedule segment that revisits the same chapter.
              const showBookHeader =
                !prev ||
                prev.abbr !== v.abbr ||
                prev.chapter !== v.chapter ||
                Boolean(v.segmentStart)
              const chapterActive =
                Boolean(activeChapter?.announce) &&
                activeChapter?.abbr === v.abbr &&
                activeChapter.chapter === v.chapter &&
                activeChapter.verseIndex === i
              const verseActive =
                activeVerse?.abbr === v.abbr &&
                activeVerse.chapter === v.chapter &&
                activeVerse.verse === v.verse &&
                (activeVerse.verseIndex == null || activeVerse.verseIndex === i)
              return (
                <Fragment key={listKey}>
                  {showBookHeader && (
                    <div
                      id={`ch-${v.abbr}-${v.chapter}-${i}`}
                      className={chapterActive ? 'book-header book-header-active' : 'book-header'}
                      role="heading"
                      aria-level={2}
                    >
                      {getBookName(v.abbr)} · {v.chapter}장
                    </div>
                  )}
                  <button
                    type="button"
                    id={`v-${v.abbr}-${v.chapter}-${v.verse}-${i}`}
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
                    <span className="verse-num">{v.verse}{v.verseEnd && v.verseEnd > v.verse ? `-${v.verseEnd}` : ''}</span>
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
          <button type="button" className="copy-btn copy-btn-listen" onClick={() => void handleListenFromSelected()}>
            여기부터 듣기
          </button>
          <button type="button" className="copy-btn" onClick={handleCopy}>
            복사
          </button>
          <button type="button" className="copy-clear" onClick={() => setSelected(new Set())}>
            선택 해제
          </button>
        </div>
      )}

      <footer ref={footerRef} className="reader-chrome reader-chrome-bottom">
        {audioOpen && (
          <AudioPlayer
            day={day}
            verses={verses}
            ttsVoiceUri={ttsVoiceUri}
            onTtsVoiceUriChange={onTtsVoiceUriChange}
            startAt={ttsStartAt}
            onActiveChapter={setActiveChapter}
            onActiveVerse={setActiveVerse}
            onPlayingChange={handlePlayingChange}
            onRateChange={setAudioRate}
            onUnavailable={(message) => setToast(message)}
          />
        )}
        {newAudioEntry && (
          <NewAudioPlayer
            entry={newAudioEntry}
            onActiveChapter={setActiveChapter}
            onActiveVerse={setActiveVerse}
            onPlayingChange={handlePlayingChange}
            onRateChange={setAudioRate}
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
            {autoScrollOn ? '스크롤 ✓' : '스크롤'}
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
            className={`new-audio-action${newAudioEntry ? ' primary' : ''}`}
            aria-pressed={Boolean(newAudioEntry)}
            onClick={() => {
              void handleNewAudioClick()
            }}
          >
            {newAudioLoading ? '음원 확인 중…' : `신규음성${newAudioEntry ? ' ✓' : ''}`}
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
          {collection ? <button type="button" onClick={onClose}>범위 다시 입력</button> : <>
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
          </>}
        </div>
      </footer>

      {toast && <div className="toast">{toast}</div>}

      {rangeOpen && (
        <div
          className="settings-overlay"
          id="reader-range-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="오늘의 읽기 범위"
        >
          <button
            type="button"
            className="settings-overlay-backdrop"
            aria-label="읽기 범위 닫기"
            onClick={() => setRangeOpen(false)}
          />
          <div className="settings-overlay-sheet range-overlay-sheet">
            <div className="settings-panel">
              <div className="settings-back">
                <button type="button" className="pill" onClick={() => setRangeOpen(false)}>
                  닫기
                </button>
              </div>
              <h2 className="section-title">오늘의 읽기 범위</h2>
              <p className="section-desc">
                {collection ? '모아읽기' : item.month != null && item.monthDay != null
                  ? `${item.month}월 ${item.monthDay}일`
                  : `DAY ${item.day}`}
              </p>
              <ul className="range-overlay-list">
                {item.range
                  .split(',')
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .map((part) => (
                    <li key={part}>{part}</li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}

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

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  audioUrl,
  chapterAtTime,
  findAudioDay,
  loadAudioManifest,
  resolveVerseCues,
  verseAtTime,
  verseCueKey,
  type AudioChapterCue,
  type AudioDayEntry,
  type AudioVerseCue,
  type VoiceGender,
} from '../lib/audio'
import type { TranslationId } from '../lib/settings'
import type { Verse } from '../types'

const RATES = [0.75, 1, 1.25, 1.5, 2] as const

type Props = {
  day: number
  translationId: TranslationId
  voiceGender: VoiceGender
  verses: Verse[]
  onActiveChapter?: (cue: AudioChapterCue | null) => void
  onActiveVerse?: (cue: AudioVerseCue | null) => void
  onPlayingChange?: (playing: boolean) => void
  onUnavailable?: (message: string) => void
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AudioPlayer({
  day,
  translationId,
  voiceGender,
  verses,
  onActiveChapter,
  onActiveVerse,
  onPlayingChange,
  onUnavailable,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [entry, setEntry] = useState<AudioDayEntry | null>(null)
  const [checked, setChecked] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const lastVerseKey = useRef<string | null>(null)
  const lastChapterKey = useRef<string | null>(null)

  const onChapterRef = useRef(onActiveChapter)
  onChapterRef.current = onActiveChapter
  const onVerseRef = useRef(onActiveVerse)
  onVerseRef.current = onActiveVerse
  const onPlayingRef = useRef(onPlayingChange)
  onPlayingRef.current = onPlayingChange
  const onUnavailableRef = useRef(onUnavailable)
  onUnavailableRef.current = onUnavailable

  const verseCues = useMemo(() => resolveVerseCues(entry, verses), [entry, verses])
  const verseCuesRef = useRef(verseCues)
  verseCuesRef.current = verseCues
  const entryRef = useRef(entry)
  entryRef.current = entry

  useEffect(() => {
    let cancelled = false
    setChecked(false)
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
    setEntry(null)
    lastVerseKey.current = null
    lastChapterKey.current = null
    onChapterRef.current?.(null)
    onVerseRef.current?.(null)
    onPlayingRef.current?.(false)

    loadAudioManifest().then((manifest) => {
      if (cancelled) return
      const found = findAudioDay(manifest, translationId, voiceGender, day)
      setEntry(found)
      setChecked(true)
    })

    return () => {
      cancelled = true
      const el = audioRef.current
      if (el) {
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
      onPlayingRef.current?.(false)
    }
  }, [day, translationId, voiceGender])

  useEffect(() => {
    const el = audioRef.current
    if (!el || !entry) return
    el.src = audioUrl(entry.path)
    el.playbackRate = rate
    el.load()
    // rate is applied below without reloading — do not depend on `rate` here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.playbackRate = rate
  }, [rate])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const emitCues = (timeSec: number) => {
      const timeMs = timeSec * 1000
      const dayEntry = entryRef.current
      if (dayEntry?.chapters?.length) {
        const cue = chapterAtTime(dayEntry.chapters, timeMs)
        const key = cue ? `${cue.abbr}-${cue.chapter}` : null
        if (key !== lastChapterKey.current) {
          lastChapterKey.current = key
          onChapterRef.current?.(cue)
        }
      }
      const cues = verseCuesRef.current
      if (cues.length) {
        const vc = verseAtTime(cues, timeMs)
        const key = vc ? verseCueKey(vc) : null
        if (key !== lastVerseKey.current) {
          lastVerseKey.current = key
          onVerseRef.current?.(vc)
        }
      }
    }

    const onTime = () => {
      setCurrent(el.currentTime)
      emitCues(el.currentTime)
    }
    const onMeta = () =>
      setDuration(el.duration || (entryRef.current?.durationMs ?? 0) / 1000)
    const onPlay = () => {
      setPlaying(true)
      onPlayingRef.current?.(true)
    }
    const onPause = () => {
      setPlaying(false)
      onPlayingRef.current?.(false)
    }
    const onEnded = () => {
      setPlaying(false)
      onPlayingRef.current?.(false)
      lastVerseKey.current = null
      lastChapterKey.current = null
      onChapterRef.current?.(null)
      onVerseRef.current?.(null)
    }

    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
    }
  }, [entry])

  const available = Boolean(entry)
  const totalSec = duration || (entry?.durationMs ?? 0) / 1000

  const notifyUnavailable = () => {
    onUnavailableRef.current?.('준비중입니다')
  }

  const toggle = async () => {
    if (!available) {
      notifyUnavailable()
      return
    }
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      try {
        await el.play()
      } catch {
        // autoplay / gesture restrictions
      }
    } else {
      el.pause()
    }
  }

  const stop = () => {
    if (!available) {
      notifyUnavailable()
      return
    }
    const el = audioRef.current
    if (!el) return
    el.pause()
    el.currentTime = 0
    setCurrent(0)
    lastVerseKey.current = null
    lastChapterKey.current = null
    onChapterRef.current?.(null)
    onVerseRef.current?.(null)
  }

  return (
    <div className={`audio-player${available ? '' : ' audio-player-pending'}`}>
      <audio ref={audioRef} preload="metadata" />
      <div className="audio-player-controls">
        <button
          type="button"
          className="audio-btn"
          onClick={toggle}
          disabled={!checked}
          aria-label={available ? (playing ? '일시정지' : '재생') : '음원 준비중'}
        >
          {available ? (playing ? '일시정지' : '재생') : '듣기'}
        </button>
        <button
          type="button"
          className="audio-btn"
          onClick={stop}
          disabled={!checked}
          aria-label="정지"
        >
          정지
        </button>
        <label className="audio-rate">
          <span className="audio-rate-label">배속</span>
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            aria-label="재생 속도"
            disabled={!available}
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
        </label>
        <span className="audio-time">
          {available
            ? `${formatTime(current)} / ${formatTime(totalSec)}`
            : checked
              ? '음원 준비중'
              : '…'}
        </span>
      </div>
      <input
        type="range"
        className="audio-seek"
        min={0}
        max={available ? totalSec || 0 : 0}
        step={0.1}
        value={available ? Math.min(current, totalSec || 0) : 0}
        disabled={!available}
        onChange={(e) => {
          if (!available) {
            notifyUnavailable()
            return
          }
          const el = audioRef.current
          const v = Number(e.target.value)
          if (el) el.currentTime = v
          setCurrent(v)
        }}
        onPointerDown={() => {
          if (!available) notifyUnavailable()
        }}
        aria-label="재생 위치"
      />
    </div>
  )
}

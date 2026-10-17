import { useEffect, useMemo, useRef, useState } from 'react'
import {
  audioUrl,
  chapterAtTime,
  resolveVerseCues,
  verseAtTime,
  type AudioChapterCue,
  type AudioDayEntry,
  type AudioVerseCue,
} from '../lib/audio'
import type { Verse } from '../types'

const RATES = [0.75, 1, 1.25, 1.5, 2] as const

type Props = {
  entry: AudioDayEntry
  verses: Verse[]
  onActiveChapter?: (cue: AudioChapterCue | null) => void
  onActiveVerse?: (cue: AudioVerseCue | null) => void
  onPlayingChange?: (playing: boolean) => void
  onRateChange?: (rate: number) => void
  onUnavailable?: (message: string) => void
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function NewAudioPlayer({
  entry,
  verses,
  onActiveChapter,
  onActiveVerse,
  onPlayingChange,
  onRateChange,
  onUnavailable,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [time, setTime] = useState(0)
  const [failed, setFailed] = useState(false)
  const verseCues = useMemo(() => resolveVerseCues(entry, verses), [entry, verses])
  const cueOptions = useMemo(
    () =>
      verseCues.map((cue, index) => ({
        cue,
        index,
        label: `${cue.abbr} ${cue.chapter}:${cue.verse}`,
      })),
    [verseCues],
  )

  const clearCues = () => {
    onActiveChapter?.(null)
    onActiveVerse?.(null)
  }

  const stop = () => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setTime(0)
    setPlaying(false)
    onPlayingChange?.(false)
    clearCues()
  }

  useEffect(() => {
    onRateChange?.(rate)
  }, [onRateChange, rate])

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) audio.pause()
      onPlayingChange?.(false)
      clearCues()
    }
    // The callbacks intentionally use their latest render only while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateCues = (seconds: number) => {
    const atMs = Math.round(seconds * 1000)
    const chapter = chapterAtTime(entry.chapters, atMs)
    if (!chapter) {
      clearCues()
      return
    }

    const firstVerseIndex = verseCues.findIndex(
      (cue) => cue.abbr === chapter.abbr && cue.chapter === chapter.chapter && cue.startMs >= chapter.startMs,
    )
    const firstVerse = firstVerseIndex >= 0 ? verseCues[firstVerseIndex] : null
    if (firstVerse && atMs < firstVerse.startMs) {
      const verseIndex = verses.findIndex(
        (verse) =>
          verse.abbr === firstVerse.abbr &&
          verse.chapter === firstVerse.chapter &&
          verse.verse === firstVerse.verse,
      )
      onActiveChapter?.({ ...chapter, verseIndex: verseIndex >= 0 ? verseIndex : undefined })
      onActiveVerse?.(null)
      return
    }

    onActiveChapter?.({ ...chapter, announce: '' })
    onActiveVerse?.(verseAtTime(verseCues, atMs))
  }

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio || failed) return
    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        setFailed(true)
        setPlaying(false)
        onPlayingChange?.(false)
        onUnavailable?.('신규음성을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.')
      }
      return
    }
    audio.pause()
  }

  const changeRate = (next: number) => {
    const audio = audioRef.current
    if (audio) audio.playbackRate = next
    setRate(next)
  }

  const jumpToCue = (index: number) => {
    const cue = cueOptions[index]?.cue
    const audio = audioRef.current
    if (!cue || !audio) return
    audio.currentTime = cue.startMs / 1000
    setTime(audio.currentTime)
    updateCues(audio.currentTime)
  }

  const duration = Number.isFinite(entry.durationMs) ? entry.durationMs / 1000 : 0

  return (
    <div className={`audio-player new-audio-player${failed ? ' audio-player-pending' : ''}`}>
      <audio
        ref={audioRef}
        src={audioUrl(entry.path)}
        preload="metadata"
        onPlay={() => {
          setPlaying(true)
          onPlayingChange?.(true)
        }}
        onPause={() => {
          setPlaying(false)
          onPlayingChange?.(false)
        }}
        onEnded={stop}
        onError={() => {
          setFailed(true)
          setPlaying(false)
          onPlayingChange?.(false)
          clearCues()
          onUnavailable?.('신규음성을 재생할 수 없습니다. 잠시 후 다시 시도해 주세요.')
        }}
        onTimeUpdate={(event) => {
          const next = event.currentTarget.currentTime
          setTime(next)
          updateCues(next)
        }}
      />
      <div className="audio-player-controls">
        <button type="button" className="audio-btn" onClick={() => void toggle()} disabled={failed}>
          {playing ? '일시정지' : '재생'}
        </button>
        <button type="button" className="audio-btn" onClick={stop} disabled={failed}>
          정지
        </button>
        <label className="audio-rate">
          <span className="audio-rate-label">배속</span>
          <select value={rate} onChange={(event) => changeRate(Number(event.target.value))} disabled={failed}>
            {RATES.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </label>
        <span className="audio-time">
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>
      <input
        className="audio-seek"
        type="range"
        min="0"
        max={Math.max(duration, 1)}
        step="0.1"
        value={Math.min(time, Math.max(duration, 1))}
        onChange={(event) => {
          const next = Number(event.target.value)
          const audio = audioRef.current
          if (audio) audio.currentTime = next
          setTime(next)
          updateCues(next)
        }}
        aria-label="신규음성 재생 위치"
        disabled={failed}
      />
      <label className="audio-position">
        <span className="audio-rate-label">위치</span>
        <select
          value={String(
            Math.max(
              0,
              cueOptions.findLastIndex((option) => option.cue.startMs <= time * 1000),
            ),
          )}
          onChange={(event) => jumpToCue(Number(event.target.value))}
          disabled={failed || !cueOptions.length}
          aria-label="신규음성 낭독 위치"
        >
          {cueOptions.map((option) => (
            <option key={`${option.cue.startMs}-${option.label}`} value={option.index}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

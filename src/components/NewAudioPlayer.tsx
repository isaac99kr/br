import { useEffect, useRef, useState } from 'react'
import type { AudioChapterCue, AudioVerseCue } from '../lib/audio'
import { queuePosition, type AudioQueue } from '../lib/audioQueue'
import { ChapterPlayback, type PlaybackState } from '../lib/chapterPlayback'

const RATES = [0.75, 1, 1.25, 1.5, 2]
type Props = {
  entry: AudioQueue
  onActiveChapter?: (cue: AudioChapterCue | null) => void
  onActiveVerse?: (cue: AudioVerseCue | null) => void
  onPlayingChange?: (playing: boolean) => void
  onRateChange?: (rate: number) => void
  onUnavailable?: (message: string) => void
}
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export function NewAudioPlayer(props: Props) {
  const { entry } = props
  const callbacks = useRef(props)
  callbacks.current = props
  const player = useRef<ChapterPlayback | null>(null)
  const [state, setState] = useState<PlaybackState>({ status: 'ready', time: 0, rate: 1 })
  useEffect(() => {
    let previousStatus = ''
    let previousCue = ''
    const engine = new ChapterPlayback(entry, next => {
      setState(next)
      const cb = callbacks.current
      if (previousStatus !== next.status) {
        cb.onPlayingChange?.(next.status === 'playing')
        if (next.status === 'error') cb.onUnavailable?.(next.error ?? '음원을 재생하지 못했습니다.')
        previousStatus = next.status
      }
      const { item, sourceTime } = queuePosition(entry, next.time)
      const active = next.status === 'playing'
      const cue = active ? item.cues.find(c => c.start <= sourceTime && sourceTime < c.end) : undefined
      const key = active ? `${item.kind}:${item.verseIndex}:${cue?.verseIndex ?? '-'}` : 'none'
      if (key !== previousCue) {
        const timing = item.chapter.timing
        cb.onActiveChapter?.(active ? { abbr: timing.abbr, chapter: timing.chapter,
          announce: item.kind === 'announcement' ? timing.announcement.text : '', startMs: item.start * 1000,
          verseIndex: item.verseIndex } : null)
        cb.onActiveVerse?.(cue ? { abbr: timing.abbr, chapter: timing.chapter, verse: cue.verse,
          startMs: cue.start * 1000, verseIndex: cue.verseIndex } : null)
        previousCue = key
      }
    })
    player.current = engine
    return () => {
      engine.dispose()
      player.current = null
      callbacks.current.onPlayingChange?.(false)
      callbacks.current.onActiveChapter?.(null)
      callbacks.current.onActiveVerse?.(null)
    }
  }, [entry])
  const positions = entry.items.flatMap(item => item.cues.map(cue => ({
    time: item.queueStart + cue.start - item.start, index: cue.verseIndex,
    label: `${item.chapter.timing.abbr} ${item.chapter.timing.chapter}:${cue.verse}${cue.verseEnd > cue.verse ? `-${cue.verseEnd}` : ''}`,
  })))
  const playing = state.status === 'playing'
  const loading = state.status === 'loading'
  return (
    <div className="audio-player new-audio-player">
      {entry.combined && <p role="note">합절 본문은 선택한 절을 포함하는 합절 전체를 재생합니다.</p>}
      {state.error && <p role="alert">{state.error}</p>}
      <div className="audio-player-controls">
        <button type="button" className="audio-btn" onClick={() => playing || loading ? player.current?.pause() : void player.current?.play()}>
          {loading ? '불러오기 취소' : playing ? '일시정지' : state.status === 'error' ? '다시 시도' : '재생'}
        </button>
        <button type="button" className="audio-btn" onClick={() => player.current?.stop()}>정지</button>
        <label className="audio-rate"><span className="audio-rate-label">배속</span>
          <select value={state.rate} onChange={e => { const rate = Number(e.target.value); player.current?.setRate(rate); props.onRateChange?.(rate) }}>
            {RATES.map(rate => <option key={rate} value={rate}>{rate}x</option>)}
          </select>
        </label>
        <span className="audio-time" aria-live="off">{formatTime(state.time)} / {formatTime(entry.duration)}</span>
      </div>
      <input className="audio-seek" type="range" min={0} max={entry.duration} step={0.1} value={state.time}
        aria-label="신규음성 재생 위치" onChange={e => player.current?.seek(Number(e.target.value))} />
      <label className="audio-position"><span className="audio-rate-label">위치</span>
        <select aria-label="신규음성 낭독 위치" value={Math.max(0, positions.findLastIndex(p => p.time <= state.time))}
          onChange={e => player.current?.seek(positions[Number(e.target.value)].time)}>
          {positions.map((p, i) => <option key={p.index} value={i}>{p.label}</option>)}
        </select>
      </label>
    </div>
  )
}

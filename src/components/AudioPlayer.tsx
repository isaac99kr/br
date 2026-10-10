import { useEffect, useMemo, useRef, useState } from 'react'
import type { AudioChapterCue, AudioVerseCue } from '../lib/audio'
import {
  TTS_UNSUPPORTED_MESSAGE,
  buildDaySpeakUnits,
  findVerseUnitIndex,
  isSpeechSynthesisSupported,
  listVerseOptions,
  loadKoreanVoices,
  pickDefaultKoreanVoice,
  voiceLabel,
  type SpeakUnit,
} from '../lib/browserTts'
import type { Verse } from '../types'

const RATES = [0.75, 1, 1.25, 1.5, 2] as const

export type TtsStartAt = {
  abbr: string
  chapter: number
  verse: number
  nonce: number
}

type Props = {
  day: number
  verses: Verse[]
  ttsVoiceUri: string | null
  onTtsVoiceUriChange: (uri: string | null) => void
  startAt?: TtsStartAt | null
  onActiveChapter?: (cue: AudioChapterCue | null) => void
  onActiveVerse?: (cue: AudioVerseCue | null) => void
  onPlayingChange?: (playing: boolean) => void
  onRateChange?: (rate: number) => void
  onUnavailable?: (message: string) => void
}

export function AudioPlayer({
  day,
  verses,
  ttsVoiceUri,
  onTtsVoiceUriChange,
  startAt = null,
  onActiveChapter,
  onActiveVerse,
  onPlayingChange,
  onRateChange,
  onUnavailable,
}: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceUri, setVoiceUri] = useState<string | null>(ttsVoiceUri)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [unitIndex, setUnitIndex] = useState(0)

  const units = useMemo(() => buildDaySpeakUnits(verses), [verses])
  const verseOptions = useMemo(() => listVerseOptions(units), [units])
  const verseCount = verseOptions.length
  const verseOrdinal = useMemo(() => {
    let n = 0
    for (let i = 0; i < unitIndex && i < units.length; i++) {
      if (units[i].kind === 'verse') n++
    }
    const cur = units[unitIndex]
    if (cur?.kind === 'verse') n++
    return n
  }, [units, unitIndex])

  const unitsRef = useRef(units)
  unitsRef.current = units
  const rateRef = useRef(rate)
  rateRef.current = rate
  const voiceUriRef = useRef(voiceUri)
  voiceUriRef.current = voiceUri
  const voicesRef = useRef(voices)
  voicesRef.current = voices
  const indexRef = useRef(0)
  const speakingRef = useRef(false)
  const pausedRef = useRef(false)
  /** Bumped to drop stale speak callbacks after cancel/stop/day change. */
  const speakGenerationRef = useRef(0)
  const speakFromRef = useRef<(startIndex: number) => void>(() => {})

  const onChapterRef = useRef(onActiveChapter)
  onChapterRef.current = onActiveChapter
  const onVerseRef = useRef(onActiveVerse)
  onVerseRef.current = onActiveVerse
  const onPlayingRef = useRef(onPlayingChange)
  onPlayingRef.current = onPlayingChange
  const onRateRef = useRef(onRateChange)
  onRateRef.current = onRateChange
  const onUnavailableRef = useRef(onUnavailable)
  onUnavailableRef.current = onUnavailable
  const onVoiceChangeRef = useRef(onTtsVoiceUriChange)
  onVoiceChangeRef.current = onTtsVoiceUriChange

  useEffect(() => {
    onRateRef.current?.(rate)
  }, [rate])

  useEffect(() => {
    setVoiceUri(ttsVoiceUri)
  }, [ttsVoiceUri])

  const clearCues = () => {
    onChapterRef.current?.(null)
    onVerseRef.current?.(null)
  }

  const cancelSynthesis = () => {
    if (!isSpeechSynthesisSupported()) return
    window.speechSynthesis.cancel()
  }

  const invalidateSpeech = () => {
    speakGenerationRef.current += 1
    speakingRef.current = false
    pausedRef.current = false
    cancelSynthesis()
  }

  const speakFrom = (startIndex: number) => {
    if (!isSpeechSynthesisSupported()) return
    const list = unitsRef.current
    if (!list.length || startIndex < 0 || startIndex >= list.length) {
      invalidateSpeech()
      setPlaying(false)
      onPlayingRef.current?.(false)
      setUnitIndex(0)
      indexRef.current = 0
      clearCues()
      return
    }

    const voice =
      pickDefaultKoreanVoice(voicesRef.current, voiceUriRef.current) ?? null
    if (!voice) {
      onUnavailableRef.current?.(TTS_UNSUPPORTED_MESSAGE)
      return
    }

    // cancel() then speak() in the same turn is often dropped (Chrome/Safari).
    cancelSynthesis()
    const generation = ++speakGenerationRef.current
    speakingRef.current = true
    pausedRef.current = false
    indexRef.current = startIndex
    setUnitIndex(startIndex)
    setPlaying(true)
    onPlayingRef.current?.(true)

    const speakOne = (i: number) => {
      if (speakGenerationRef.current !== generation) return
      if (!speakingRef.current || pausedRef.current) return
      const listNow = unitsRef.current
      if (i >= listNow.length) {
        if (speakGenerationRef.current !== generation) return
        speakingRef.current = false
        setPlaying(false)
        onPlayingRef.current?.(false)
        setUnitIndex(0)
        indexRef.current = 0
        clearCues()
        return
      }

      const unit: SpeakUnit = listNow[i]
      indexRef.current = i
      setUnitIndex(i)

      const utter = new SpeechSynthesisUtterance(unit.text)
      utter.voice = voice
      utter.lang = voice.lang || 'ko-KR'
      utter.rate = rateRef.current

      utter.onstart = () => {
        if (speakGenerationRef.current !== generation) return
        if (!speakingRef.current) return
        if (unit.kind === 'announce') {
          onChapterRef.current?.({
            abbr: unit.abbr,
            chapter: unit.chapter,
            announce: unit.text,
            startMs: 0,
          })
          onVerseRef.current?.(null)
        } else {
          onChapterRef.current?.({
            abbr: unit.abbr,
            chapter: unit.chapter,
            announce: '',
            startMs: 0,
          })
          onVerseRef.current?.({
            abbr: unit.abbr,
            chapter: unit.chapter,
            verse: unit.verse,
            startMs: 0,
          })
        }
      }

      utter.onend = () => {
        if (speakGenerationRef.current !== generation) return
        if (!speakingRef.current || pausedRef.current) return
        speakOne(i + 1)
      }

      utter.onerror = (ev) => {
        const err = (ev as SpeechSynthesisErrorEvent).error
        if (err === 'interrupted' || err === 'canceled') return
        if (speakGenerationRef.current !== generation) return
        if (!speakingRef.current || pausedRef.current) return
        speakingRef.current = false
        setPlaying(false)
        onPlayingRef.current?.(false)
      }

      window.speechSynthesis.speak(utter)
    }

    window.setTimeout(() => {
      if (speakGenerationRef.current !== generation) return
      if (!speakingRef.current || pausedRef.current) return
      speakOne(startIndex)
    }, 40)
  }

  speakFromRef.current = speakFrom

  useEffect(() => {
    let cancelled = false
    setReady(false)
    invalidateSpeech()
    setPlaying(false)
    onPlayingRef.current?.(false)
    setUnitIndex(0)
    indexRef.current = 0
    clearCues()

    if (!isSpeechSynthesisSupported()) {
      setVoices([])
      setReady(true)
      return () => {
        cancelled = true
      }
    }

    loadKoreanVoices().then((list) => {
      if (cancelled) return
      setVoices(list)
      const picked = pickDefaultKoreanVoice(list, ttsVoiceUri)
      const uri = picked?.voiceURI ?? null
      setVoiceUri(uri)
      if (uri && uri !== ttsVoiceUri) onVoiceChangeRef.current?.(uri)
      setReady(true)
    })

    return () => {
      cancelled = true
      invalidateSpeech()
      onPlayingRef.current?.(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, verses])

  const available = ready && voices.length > 0 && units.length > 0

  // Jump when parent requests a verse (nonce changes).
  useEffect(() => {
    if (!startAt || !available) return
    const idx = findVerseUnitIndex(
      unitsRef.current,
      startAt.abbr,
      startAt.chapter,
      startAt.verse,
    )
    if (idx < 0) {
      onUnavailableRef.current?.('선택한 절을 찾지 못했습니다')
      return
    }
    speakFromRef.current(idx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt?.nonce, available])

  const toggle = () => {
    if (!available) {
      onUnavailableRef.current?.(TTS_UNSUPPORTED_MESSAGE)
      return
    }
    if (!isSpeechSynthesisSupported()) return

    if (playing && !pausedRef.current) {
      const synth = window.speechSynthesis
      // Stuck UI after a dropped cancel→speak: recover by restarting.
      if (!synth.speaking && !synth.pending && !synth.paused) {
        speakFrom(indexRef.current)
        return
      }
      pausedRef.current = true
      speakingRef.current = false
      synth.pause()
      if (!synth.paused) {
        cancelSynthesis()
      }
      setPlaying(false)
      onPlayingRef.current?.(false)
      return
    }

    if (pausedRef.current && window.speechSynthesis.paused) {
      pausedRef.current = false
      speakingRef.current = true
      window.speechSynthesis.resume()
      setPlaying(true)
      onPlayingRef.current?.(true)
      return
    }

    speakFrom(indexRef.current)
  }

  const stop = () => {
    invalidateSpeech()
    setPlaying(false)
    onPlayingRef.current?.(false)
    setUnitIndex(0)
    indexRef.current = 0
    clearCues()
  }

  const jumpToOrdinal = (ordinal: number) => {
    if (!available) return
    const opt = verseOptions.find((o) => o.ordinal === ordinal)
    if (!opt) return
    speakFrom(opt.unitIndex)
  }

  const onVoiceSelect = (uri: string) => {
    setVoiceUri(uri)
    onTtsVoiceUriChange(uri)
    const wasPlaying = playing || pausedRef.current
    const resumeAt = indexRef.current
    invalidateSpeech()
    setPlaying(false)
    onPlayingRef.current?.(false)
    if (wasPlaying) {
      window.setTimeout(() => speakFrom(resumeAt), 40)
    }
  }

  const selectOrdinal = Math.min(Math.max(verseOrdinal, 1), verseCount || 1)

  return (
    <div className={`audio-player${available ? '' : ' audio-player-pending'}`}>
      <div className="audio-player-controls">
        <button
          type="button"
          className="audio-btn"
          onClick={toggle}
          disabled={!ready}
          aria-label={available ? (playing ? '일시정지' : '재생') : '음성 읽기 불가'}
        >
          {available ? (playing ? '일시정지' : '재생') : '듣기'}
        </button>
        <button type="button" className="audio-btn" onClick={stop} disabled={!ready} aria-label="정지">
          정지
        </button>
        <label className="audio-rate">
          <span className="audio-rate-label">배속</span>
          <select
            value={rate}
            onChange={(e) => {
              const next = Number(e.target.value)
              setRate(next)
              rateRef.current = next
              if (playing) {
                const at = indexRef.current
                speakFrom(at)
              }
            }}
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
      </div>
      <label className="audio-position">
        <span className="audio-rate-label">위치</span>
        <select
          value={available && verseCount ? String(selectOrdinal) : ''}
          onChange={(e) => jumpToOrdinal(Number(e.target.value))}
          aria-label="낭독 위치"
          disabled={!available || !verseCount}
        >
          {!available || !verseCount ? (
            <option value="">{ready ? '음성 없음' : '…'}</option>
          ) : (
            verseOptions.map((o) => (
              <option key={o.unitIndex} value={String(o.ordinal)}>
                {o.label}
              </option>
            ))
          )}
        </select>
      </label>
      <label className="audio-voice">
        <span className="audio-rate-label">화자</span>
        <select
          value={voiceUri ?? ''}
          onChange={(e) => onVoiceSelect(e.target.value)}
          aria-label="한국어 화자"
          disabled={!available || voices.length === 0}
        >
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {voiceLabel(v)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

import { getBookName } from './bookNames'
import type { Verse } from '../types'

export const TTS_UNSUPPORTED_MESSAGE =
  '이 브라우저에서는 한국어 음성 읽기를 지원하지 않습니다. Chrome 또는 Safari 등 다른 브라우저를 이용해 주세요.'

const SECTION_TITLE_RE = /^<[^>]+>\s*/

const KO_DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'] as const

export type SpeakUnit =
  | { kind: 'announce'; text: string; abbr: string; chapter: number }
  | { kind: 'verse'; text: string; abbr: string; chapter: number; verse: number }

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  )
}

export function stripSectionTitle(text: string): string {
  return (text || '').replace(SECTION_TITLE_RE, '').trim()
}

export function koreanChapterNumber(n: number): string {
  if (n < 1 || n > 199) return String(n)
  if (n < 10) return KO_DIGITS[n]
  if (n < 20) return n === 10 ? '십' : `십${KO_DIGITS[n % 10]}`
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    const head = `${KO_DIGITS[tens]}십`
    return ones === 0 ? head : `${head}${KO_DIGITS[ones]}`
  }
  const rest = n - 100
  if (rest === 0) return '백'
  return `백${koreanChapterNumber(rest)}`
}

export function chapterAnnounce(abbr: string, chapter: number): string {
  return `${getBookName(abbr)} ${koreanChapterNumber(chapter)}장 말씀입니다.`
}

export function buildDaySpeakUnits(verses: Verse[]): SpeakUnit[] {
  const units: SpeakUnit[] = []
  let prevKey: string | null = null
  for (const v of verses) {
    const key = `${v.abbr}:${v.chapter}`
    if (key !== prevKey) {
      units.push({
        kind: 'announce',
        text: chapterAnnounce(v.abbr, v.chapter),
        abbr: v.abbr,
        chapter: v.chapter,
      })
      prevKey = key
    }
    const text = stripSectionTitle(v.text)
    if (!text) continue
    units.push({
      kind: 'verse',
      text,
      abbr: v.abbr,
      chapter: v.chapter,
      verse: v.verse,
    })
  }
  return units
}

export function isKoreanVoice(voice: SpeechSynthesisVoice): boolean {
  const lang = (voice.lang || '').toLowerCase()
  return lang === 'ko' || lang.startsWith('ko-')
}

export function listKoreanVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return []
  return window.speechSynthesis.getVoices().filter(isKoreanVoice)
}

/** Wait briefly for voices to load (Chrome often populates async). */
export function loadKoreanVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve([])

  const immediate = listKoreanVoices()
  if (immediate.length) return Promise.resolve(immediate)

  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    let done = false
    const finish = () => {
      if (done) return
      done = true
      synth.removeEventListener('voiceschanged', onChange)
      window.clearTimeout(timer)
      resolve(listKoreanVoices())
    }
    const onChange = () => finish()
    synth.addEventListener('voiceschanged', onChange)
    const timer = window.setTimeout(finish, 1500)
    // Some browsers fire sync after a tick
    window.setTimeout(() => {
      if (listKoreanVoices().length) finish()
    }, 0)
  })
}

export function pickDefaultKoreanVoice(
  voices: SpeechSynthesisVoice[],
  savedUri?: string | null,
): SpeechSynthesisVoice | null {
  if (!voices.length) return null
  if (savedUri) {
    const saved = voices.find((v) => v.voiceURI === savedUri)
    if (saved) return saved
  }
  // Prefer local Korean voices when available
  const local = voices.find((v) => v.localService)
  return local ?? voices[0]
}

export function voiceLabel(voice: SpeechSynthesisVoice): string {
  const name = voice.name || voice.voiceURI
  const lang = voice.lang ? ` (${voice.lang})` : ''
  return `${name}${lang}`
}

import type { TranslationId } from './settings'
import type { Verse } from '../types'

const BASE = import.meta.env.BASE_URL

/** Default chapter-announce duration used when estimating verse cues. */
export const DEFAULT_ANNOUNCE_MS = 2400

export type VoiceGender = 'female' | 'male'

export type AudioChapterCue = {
  abbr: string
  chapter: number
  announce: string
  startMs: number
}

export type AudioVerseCue = {
  abbr: string
  chapter: number
  verse: number
  startMs: number
}

export type AudioDayEntry = {
  day: number
  path: string
  durationMs: number
  bytes: number
  chapters: AudioChapterCue[]
  /** Present on newer generations; preferred over client estimate. */
  verses?: AudioVerseCue[]
  status: string
}

export type AudioSet = {
  translationId: TranslationId
  voice: VoiceGender
  speakerId: string
  days: AudioDayEntry[]
}

export type AudioManifest = {
  version: number
  modelVersion: string
  format: string
  sets: AudioSet[]
}

let cache: AudioManifest | null = null

export async function loadAudioManifest(): Promise<AudioManifest | null> {
  if (cache) return cache
  try {
    const res = await fetch(`${BASE}audio/manifest.json`)
    if (!res.ok) return null
    cache = (await res.json()) as AudioManifest
    return cache
  } catch {
    return null
  }
}

export function findAudioDay(
  manifest: AudioManifest | null,
  translationId: TranslationId,
  voice: VoiceGender,
  day: number,
): AudioDayEntry | null {
  if (!manifest) return null
  const set = manifest.sets.find(
    (s) => s.translationId === translationId && s.voice === voice,
  )
  if (!set) return null
  return set.days.find((d) => d.day === day) ?? null
}

export function audioUrl(path: string): string {
  const clean = path.replace(/^\//, '')
  return `${BASE}${clean}`
}

export function chapterAtTime(
  chapters: AudioChapterCue[],
  timeMs: number,
): AudioChapterCue | null {
  if (!chapters.length) return null
  let current = chapters[0]
  for (const c of chapters) {
    if (c.startMs <= timeMs) current = c
    else break
  }
  return current
}

export function verseAtTime(
  cues: AudioVerseCue[],
  timeMs: number,
): AudioVerseCue | null {
  if (!cues.length) return null
  let current: AudioVerseCue | null = null
  for (const c of cues) {
    if (c.startMs <= timeMs) current = c
    else break
  }
  return current
}

function verseCharWeight(text: string): number {
  return Math.max(1, text.replace(/\s+/g, '').length)
}

/**
 * Prefer manifest.verses when present; otherwise estimate from chapter cues +
 * loaded verse texts (character-weighted within each chapter after announce).
 */
export function resolveVerseCues(
  entry: AudioDayEntry | null,
  dayVerses: Verse[],
  announceMs: number = DEFAULT_ANNOUNCE_MS,
): AudioVerseCue[] {
  if (!entry) return []
  if (entry.verses?.length) return entry.verses

  const chapters = entry.chapters
  if (!chapters.length || !dayVerses.length) return []

  const cues: AudioVerseCue[] = []
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]
    const nextStart = chapters[i + 1]?.startMs ?? entry.durationMs
    const chapterVerses = dayVerses.filter(
      (v) => v.abbr === ch.abbr && v.chapter === ch.chapter,
    )
    if (!chapterVerses.length) continue

    const span = Math.max(0, nextStart - ch.startMs)
    const announce = Math.min(announceMs, Math.floor(span * 0.35))
    const bodyStart = ch.startMs + announce
    const bodyMs = Math.max(0, nextStart - bodyStart)
    const weights = chapterVerses.map((v) => verseCharWeight(v.text))
    const totalW = weights.reduce((a, b) => a + b, 0) || 1

    let acc = 0
    for (let vi = 0; vi < chapterVerses.length; vi++) {
      const v = chapterVerses[vi]
      const startMs = Math.round(bodyStart + (acc / totalW) * bodyMs)
      cues.push({
        abbr: v.abbr,
        chapter: v.chapter,
        verse: v.verse,
        startMs,
      })
      acc += weights[vi]
    }
  }
  return cues
}

export function verseCueKey(c: Pick<AudioVerseCue, 'abbr' | 'chapter' | 'verse'>): string {
  return `${c.abbr}-${c.chapter}-${c.verse}`
}

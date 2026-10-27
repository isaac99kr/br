import type { TranslationId } from './settings'

export type SampleSpan = { startSample: number; endSample: number; startMs: number; endMs: number }
export type ChapterTiming = {
  schemaVersion: number
  translationId: TranslationId
  book: string
  abbr: string
  chapter: number
  audio: string
  audioSha256: string
  generationHash: string
  sampleRate: number
  totalSamples: number
  durationMs: number
  timeUnit: 'ms'
  announcement: SampleSpan & { text: string }
  verses: (SampleSpan & { verse: number; verseEnd?: number; kind?: 'verse' | 'absent' })[]
}
export type ChapterAsset = {
  translationId: TranslationId
  book: string
  abbr: string
  chapter: number
  audioUrl: string
  timingUrl: string
  audioSha256: string
  timingSha256: string
  generationHash: string
  durationMs: number
  bytes: number
  verseNumbers: number[]
}
export type ChapterManifest = { schemaVersion: 1; releaseId: string; chapters: ChapterAsset[] }
export type LoadedChapter = { asset: ChapterAsset; timing: ChapterTiming }
export const chapterKey = (translation: string, abbr: string, chapter: number) => `${translation}:${abbr}:${chapter}`
// GitHub Pages builds do not provide runtime environment variables. Keep the
// public R2 origin as a non-secret fallback; Vite env can still override it
// for another deployment target.
const base = import.meta.env.VITE_CHAPTER_AUDIO_BASE_URL
  || 'https://pub-a583efe19bfb425694885e4391291f39.r2.dev/'

export function assetUrl(path: string, root: string): string {
  const url = new URL(path, root)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('잘못된 음원 URL입니다.')
  return url.href
}

export function validateTiming(value: unknown, asset: ChapterAsset): ChapterTiming {
  const m = value as ChapterTiming
  if (!m || m.schemaVersion !== 1 || m.timeUnit !== 'ms' || m.translationId !== asset.translationId ||
      m.book !== asset.book || m.abbr !== asset.abbr || m.chapter !== asset.chapter ||
      m.audioSha256 !== asset.audioSha256 || m.generationHash !== asset.generationHash ||
      !Number.isSafeInteger(m.sampleRate) || m.sampleRate < 8000 ||
      !Number.isSafeInteger(m.totalSamples) || m.totalSamples <= 0 || !Array.isArray(m.verses) || !m.verses.length) {
    throw new Error('음원과 시간 정보가 일치하지 않습니다.')
  }
  const checkSpan = (span: SampleSpan) => {
    if (!span || !Number.isSafeInteger(span.startSample) || !Number.isSafeInteger(span.endSample) ||
        span.startSample < 0 || span.startSample >= span.endSample || span.endSample > m.totalSamples ||
        !Number.isFinite(span.startMs) || !Number.isFinite(span.endMs) ||
        Math.abs(span.startMs - span.startSample * 1000 / m.sampleRate) > 0.002 ||
        Math.abs(span.endMs - span.endSample * 1000 / m.sampleRate) > 0.002) throw new Error('잘못된 절 시간입니다.')
  }
  checkSpan(m.announcement)
  if (m.announcement.startSample !== 0 || typeof m.announcement.text !== 'string') throw new Error('잘못된 장 안내입니다.')
  let end = m.announcement.endSample
  let previousVerse = 0
  for (const v of m.verses) {
    checkSpan(v)
    if (!Number.isSafeInteger(v.verse) || v.verse <= previousVerse || v.startSample < end ||
        !Number.isSafeInteger(v.verseEnd ?? v.verse) || (v.verseEnd ?? v.verse) < v.verse) throw new Error('절 순서가 올바르지 않습니다.')
    previousVerse = v.verseEnd ?? v.verse
    end = v.endSample
  }
  if (end !== m.totalSamples || !Number.isFinite(m.durationMs) ||
      Math.abs(m.durationMs - m.totalSamples * 1000 / m.sampleRate) > 0.002 ||
      Math.abs(asset.durationMs - m.durationMs) > 0.002 ||
      JSON.stringify(m.verses.map(v => v.verse)) !== JSON.stringify(asset.verseNumbers)) throw new Error('장 길이/절 목록이 일치하지 않습니다.')
  return m
}

async function getJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal, cache: 'no-cache' })
  if (!response.ok) throw new Error('장별 음원이 준비되지 않았거나 불러올 수 없습니다.')
  return response.json()
}

export async function loadChapters(
  translation: TranslationId, references: { abbr: string; chapter: number }[], signal?: AbortSignal,
): Promise<Map<string, LoadedChapter>> {
  const root = new URL(base.endsWith('/') ? base : `${base}/`, window.location.href).href
  const pointer = await getJson(assetUrl('current.json', root), signal)
  if (pointer.schemaVersion !== 1 || typeof pointer.manifest !== 'string') throw new Error('잘못된 음원 릴리스입니다.')
  const manifestUrl = assetUrl(pointer.manifest, root)
  const manifest: ChapterManifest = await getJson(manifestUrl, signal)
  if (manifest.schemaVersion !== 1 || manifest.releaseId !== pointer.releaseId || !Array.isArray(manifest.chapters)) throw new Error('음원 릴리스가 일치하지 않습니다.')
  const unique = [...new Map(references.map(v => [chapterKey(translation, v.abbr, v.chapter), v])).entries()]
  const assets = new Map<string, ChapterAsset>()
  for (const a of manifest.chapters) {
    const key = chapterKey(a.translationId, a.abbr, a.chapter)
    if (assets.has(key)) throw new Error('중복된 장 음원입니다.')
    assets.set(key, a)
  }
  const missing = unique.filter(([key]) => !assets.has(key)).map(([, v]) => `${v.abbr}${v.chapter}장`)
  if (missing.length) throw new Error(`아직 준비되지 않은 음원: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` 외 ${missing.length - 5}개` : ''}`)
  const result = new Map<string, LoadedChapter>()
  // Bound concurrent JSON requests and preserve one release for this whole queue.
  for (let i = 0; i < unique.length; i += 4) {
    await Promise.all(unique.slice(i, i + 4).map(async ([key]) => {
      const original = assets.get(key)!
      const asset = { ...original, audioUrl: assetUrl(original.audioUrl, manifestUrl), timingUrl: assetUrl(original.timingUrl, manifestUrl) }
      const response = await fetch(asset.timingUrl, { signal })
      if (!response.ok) throw new Error('절별 시간 정보를 불러오지 못했습니다.')
      const bytes = await response.arrayBuffer()
      const checksum = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
      if (checksum !== asset.timingSha256) throw new Error('절별 시간 파일의 해시가 일치하지 않습니다.')
      const timing = validateTiming(JSON.parse(new TextDecoder().decode(bytes)), asset)
      result.set(key, { asset, timing })
    }))
  }
  return result
}

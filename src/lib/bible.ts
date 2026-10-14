import type { BibleBook, Verse } from '../types'
import { parseReadingRange, type RangeSegment } from './rangeParser'
import type { TranslationId } from './settings'

const BASE = import.meta.env.BASE_URL

type BooksMeta = {
  books: { abbr: string; file: string; chapterCount: number }[]
  aliases: Record<string, string>
}

let metaCache: BooksMeta | null = null
const bookCache = new Map<string, BibleBook>()

function cacheKey(translationId: TranslationId, abbr: string): string {
  return `${translationId}:${abbr}`
}

async function loadMeta(): Promise<BooksMeta> {
  if (metaCache) return metaCache
  const res = await fetch(`${BASE}data/books.json`)
  if (!res.ok) throw new Error('성경 메타데이터를 불러오지 못했습니다.')
  metaCache = (await res.json()) as BooksMeta
  return metaCache
}

function resolveAbbr(csvAbbr: string, aliases: Record<string, string>): string {
  return aliases[csvAbbr] ?? csvAbbr
}

async function loadBook(
  translationId: TranslationId,
  abbr: string,
): Promise<BibleBook | null> {
  const key = cacheKey(translationId, abbr)
  if (bookCache.has(key)) return bookCache.get(key)!
  const res = await fetch(
    `${BASE}data/bible/${encodeURIComponent(translationId)}/${encodeURIComponent(abbr)}.json`,
  )
  if (!res.ok) return null
  const book = (await res.json()) as BibleBook
  bookCache.set(key, book)
  return book
}

function versesFromSegment(book: BibleBook, seg: RangeSegment): Verse[] {
  const out: Verse[] = []
  const abbr = book.abbr

  for (let ch = seg.startChapter; ch <= seg.endChapter; ch++) {
    const chapter = book.chapters[String(ch)]
    if (!chapter) continue
    const verseNums = Object.keys(chapter)
      .map(Number)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)

    for (const v of verseNums) {
      if (ch === seg.startChapter && seg.startVerse != null && v < seg.startVerse) continue
      if (ch === seg.endChapter && seg.endVerse != null && v > seg.endVerse) continue
      out.push({ abbr, chapter: ch, verse: v, text: chapter[String(v)] })
    }
  }
  return out
}

/**
 * Load verses for a schedule reading_range.
 *
 * Returns verses in schedule segment order (comma-separated parts, left to right).
 * Within each segment, verses follow canonical chapter/verse order. Across
 * segments there is no sort, merge, or dedupe — later segments may jump
 * backward in the same book.
 */
export async function loadVersesForRange(
  range: string,
  translationId: TranslationId = 'krv',
): Promise<{
  verses: Verse[]
  linked: boolean
  missing: string[]
}> {
  const meta = await loadMeta()
  const segments = parseReadingRange(range)
  if (!segments.length) {
    return { verses: [], linked: false, missing: [range] }
  }

  const verses: Verse[] = []
  const missing: string[] = []

  for (const seg of segments) {
    const fileAbbr = resolveAbbr(seg.abbr, meta.aliases)
    const book = await loadBook(translationId, fileAbbr)
    if (!book) {
      missing.push(seg.abbr)
      continue
    }
    const chunk = versesFromSegment(book, { ...seg, abbr: fileAbbr })
    if (!chunk.length) {
      missing.push(`${seg.abbr}${seg.startChapter}`)
      continue
    }
    // Mark segment boundary so UI/TTS re-announce even for the same chapter.
    chunk[0] = { ...chunk[0], segmentStart: true }
    // Append in segment order; do not reorder relative to earlier segments.
    verses.push(...chunk)
  }

  return {
    verses,
    linked: verses.length > 0,
    missing: [...new Set(missing)],
  }
}

/** Parse CSV reading_range into segment specs for bible lookup. */

export type RangeSegment = {
  abbr: string
  startChapter: number
  startVerse: number | null
  endChapter: number
  endVerse: number | null
}

/**
 * Split a reading_range into ordered segments.
 *
 * Segment order is significant (chronological / parallel reading plans).
 * Do not sort, merge, or dedupe segments — even when the same book/chapter
 * reappears out of numeric order (e.g. 행8:1-13, 행8:26-40, 행8:14-25).
 *
 * Examples:
 * - 창1-3장
 * - 민9:1-14
 * - 민20:14-24장  (20:14 through end of ch.24)
 * - 시34·56편 / 시53·55·58·61·62·64-66편
 * - 삼상18-20장, 시59편
 * - 행8:1-13, 행8:26-40, 행8:14-25, 행9:32-11:18, 행9:1-31
 */
export function parseReadingRange(range: string): RangeSegment[] {
  const parts = range
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const segments: RangeSegment[] = []

  for (const part of parts) {
    if (part.includes('·')) {
      const m = part.match(/^([가-힣]+)(.+)$/)
      if (!m) continue
      const abbr = m[1]
      const rest = m[2].replace(/편$/g, '').replace(/장$/g, '')
      for (const piece of rest.split('·')) {
        const token = piece.trim()
        if (!token) continue
        if (token.includes('-')) {
          const [a, b] = token.split('-', 2)
          const startChapter = Number(a)
          const endChapter = Number(b)
          if (!Number.isFinite(startChapter) || !Number.isFinite(endChapter)) continue
          segments.push({
            abbr,
            startChapter,
            startVerse: null,
            endChapter,
            endVerse: null,
          })
        } else {
          const n = Number(token)
          if (!Number.isFinite(n)) continue
          segments.push({
            abbr,
            startChapter: n,
            startVerse: null,
            endChapter: n,
            endVerse: null,
          })
        }
      }
      continue
    }

    const patterns: { re: RegExp; map: (m: RegExpMatchArray) => RangeSegment }[] = [
      {
        re: /^([가-힣]+)(\d+):(\d+)-(\d+):(\d+)$/,
        map: (m) => ({
          abbr: m[1],
          startChapter: Number(m[2]),
          startVerse: Number(m[3]),
          endChapter: Number(m[4]),
          endVerse: Number(m[5]),
        }),
      },
      {
        re: /^([가-힣]+)(\d+)장-(\d+):(\d+)$/,
        map: (m) => ({
          abbr: m[1],
          startChapter: Number(m[2]),
          startVerse: null,
          endChapter: Number(m[3]),
          endVerse: Number(m[4]),
        }),
      },
      {
        re: /^([가-힣]+)(\d+):(\d+)-(\d+)장$/,
        map: (m) => ({
          abbr: m[1],
          startChapter: Number(m[2]),
          startVerse: Number(m[3]),
          endChapter: Number(m[4]),
          endVerse: null,
        }),
      },
      {
        re: /^([가-힣]+)(\d+)-(\d+):(\d+)$/,
        map: (m) => ({
          abbr: m[1],
          startChapter: Number(m[2]),
          startVerse: null,
          endChapter: Number(m[3]),
          endVerse: Number(m[4]),
        }),
      },
      {
        re: /^([가-힣]+)(\d+):(\d+)-(\d+)$/,
        map: (m) => ({
          abbr: m[1],
          startChapter: Number(m[2]),
          startVerse: Number(m[3]),
          endChapter: Number(m[2]),
          endVerse: Number(m[4]),
        }),
      },
      {
        re: /^([가-힣]+)(\d+):(\d+)$/,
        map: (m) => ({
          abbr: m[1],
          startChapter: Number(m[2]),
          startVerse: Number(m[3]),
          endChapter: Number(m[2]),
          endVerse: Number(m[3]),
        }),
      },
      {
        re: /^([가-힣]+)(\d+)-(\d+)(?:장|편)?$/,
        map: (m) => ({
          abbr: m[1],
          startChapter: Number(m[2]),
          startVerse: null,
          endChapter: Number(m[3]),
          endVerse: null,
        }),
      },
      {
        re: /^([가-힣]+)(\d+)(?:장|편)?$/,
        map: (m) => ({
          abbr: m[1],
          startChapter: Number(m[2]),
          startVerse: null,
          endChapter: Number(m[2]),
          endVerse: null,
        }),
      },
    ]

    let matched = false
    for (const { re, map } of patterns) {
      const m = part.match(re)
      if (m) {
        segments.push(map(m))
        matched = true
        break
      }
    }
    if (!matched) {
      // leave unparsed; caller will show fallback note if no verses
    }
  }

  return segments
}

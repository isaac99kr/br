import { matchBookAlias } from './bookNames'

/** Parse CSV reading_range into segment specs for bible lookup. */

export type RangeSegment = {
  abbr: string
  startChapter: number
  startVerse: number | null
  endChapter: number
  endVerse: number | null
  /** Book name with no chapter. bible.ts expands this to chapter 1 through the last chapter. */
  wholeBook?: boolean
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
 * - 행20:1-2a / 행20장2b-3 / 행20:3b-21:16  (a/b half-verse markers → whole verse)
 * - 요한일서 / 요1서 / 요일 / 1요한  (책 이름만 있으면 그 책 전체. 요1장은 요한복음 1장)
 */
export function normalizeReadingRange(range: string): string {
  return range.normalize('NFC')
    .replace(/[（]/g, '(').replace(/[）]/g, ')')
    .replace(/[–—−~～]/g, '-')
    .replace(/[，、;；\n\r]+/g, ',')
    .replace(/\s+/g, '')
    // Parentheses wrap references; their contents remain part of the reading.
    .replace(/(?<=[\d장편)])\((?=[가-힣(])/g, ',')
    .replace(/\)(?=[가-힣(])/g, ',')
    .replace(/[()]/g, '')
    .replace(/(\d+)(?:장|편)(?=\d)/g, '$1:')
    .replace(/절/g, '')
    .replace(/(?:장|편)(?=-)/g, '')
}

function refSegment(
  abbr: string,
  startChapter: number,
  startVerse: number | null,
  endChapter: number,
  endVerse: number | null,
): RangeSegment {
  return { abbr, startChapter, startVerse, endChapter, endVerse }
}

// Optional a/b half-verse markers are kept in CSV display but map to whole verses.
const REF_PATTERNS: { re: RegExp; map: (abbr: string, m: RegExpMatchArray) => RangeSegment }[] = [
  {
    re: /^(\d+):(\d+)[ab]?-(\d+):(\d+)[ab]?$/,
    map: (abbr, m) => refSegment(abbr, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])),
  },
  {
    re: /^(\d+)장-(\d+):(\d+)[ab]?$/,
    map: (abbr, m) => refSegment(abbr, Number(m[1]), null, Number(m[2]), Number(m[3])),
  },
  {
    re: /^(\d+):(\d+)[ab]?-(\d+)장$/,
    map: (abbr, m) => refSegment(abbr, Number(m[1]), Number(m[2]), Number(m[3]), null),
  },
  {
    // 행20장2b-3 — chapter then verse range with optional a/b
    re: /^(\d+)장(\d+)[ab]?-(\d+)[ab]?$/,
    map: (abbr, m) => refSegment(abbr, Number(m[1]), Number(m[2]), Number(m[1]), Number(m[3])),
  },
  {
    re: /^(\d+)-(\d+):(\d+)[ab]?$/,
    map: (abbr, m) => refSegment(abbr, Number(m[1]), null, Number(m[2]), Number(m[3])),
  },
  {
    re: /^(\d+):(\d+)[ab]?-(\d+)[ab]?$/,
    map: (abbr, m) => refSegment(abbr, Number(m[1]), Number(m[2]), Number(m[1]), Number(m[3])),
  },
  {
    re: /^(\d+):(\d+)[ab]?$/,
    map: (abbr, m) => refSegment(abbr, Number(m[1]), Number(m[2]), Number(m[1]), Number(m[2])),
  },
  {
    re: /^(\d+)-(\d+)(?:장|편)?$/,
    map: (abbr, m) => refSegment(abbr, Number(m[1]), null, Number(m[2]), null),
  },
  {
    re: /^(\d+)(?:장|편)?$/,
    map: (abbr, m) => refSegment(abbr, Number(m[1]), null, Number(m[1]), null),
  },
]

function parseRef(abbr: string, ref: string, strict: boolean, part: string): RangeSegment[] | null {
  if (ref.includes('·')) {
    const rest = ref.replace(/편$/g, '').replace(/장$/g, '')
    const out: RangeSegment[] = []
    for (const piece of rest.split('·')) {
      const token = piece.trim()
      if (!token) {
        if (strict) throw new Error(`읽기 범위를 확인해 주세요: ${part}`)
        continue
      }
      if (strict && !/^\d+(?:-\d+)?$/.test(token)) throw new Error(`읽기 범위를 확인해 주세요: ${part}`)
      if (token.includes('-')) {
        const [a, b] = token.split('-', 2)
        const startChapter = Number(a)
        const endChapter = Number(b)
        if (!Number.isFinite(startChapter) || !Number.isFinite(endChapter)) {
          if (strict) throw new Error(`읽기 범위를 확인해 주세요: ${part}`)
          continue
        }
        out.push(refSegment(abbr, startChapter, null, endChapter, null))
      } else {
        const n = Number(token)
        if (!Number.isFinite(n)) {
          if (strict) throw new Error(`읽기 범위를 확인해 주세요: ${part}`)
          continue
        }
        out.push(refSegment(abbr, n, null, n, null))
      }
    }
    return out
  }

  for (const { re, map } of REF_PATTERNS) {
    const m = ref.match(re)
    if (m) return [map(abbr, m)]
  }
  return null
}

export function parseReadingRange(range: string, strict = false): RangeSegment[] {
  if (strict) {
    let depth = 0
    for (const char of range.replace(/（/g, '(').replace(/）/g, ')')) {
      if (char === '(') depth++
      if (char === ')' && --depth < 0) throw new Error('괄호의 짝을 확인해 주세요.')
    }
    if (depth !== 0) throw new Error('괄호의 짝을 확인해 주세요.')
  }
  const parts = normalizeReadingRange(range)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const segments: RangeSegment[] = []

  for (const part of parts) {
    const known = matchBookAlias(part)
    const legacy = !known && /^[가-힣]/.test(part) ? part.match(/^([가-힣]+)(.+)$/) : null
    const abbr = known?.abbr ?? legacy?.[1]
    const rest = known ? known.rest : legacy?.[2]
    if (!abbr || rest == null) {
      if (strict) throw new Error(`읽기 범위를 확인해 주세요: ${part}`)
      continue
    }
    if (!rest) {
      if (!known) {
        if (strict) throw new Error(`읽기 범위를 확인해 주세요: ${part}`)
        continue
      }
      segments.push({
        abbr,
        startChapter: 1,
        startVerse: null,
        endChapter: 1,
        endVerse: null,
        wholeBook: true,
      })
      continue
    }

    const parsed = parseRef(abbr, rest, strict, part)
    if (parsed) segments.push(...parsed)
    else if (strict) throw new Error(`읽기 범위를 확인해 주세요: ${part}`)
  }

  if (strict) {
    if (!segments.length) throw new Error('읽을 성경 범위를 입력해 주세요.')
    for (const seg of segments) {
      if (![seg.startChapter, seg.endChapter, seg.startVerse ?? 1, seg.endVerse ?? 1]
        .every((n) => Number.isSafeInteger(n) && n > 0) ||
        seg.startChapter > seg.endChapter ||
        (seg.startChapter === seg.endChapter && (seg.startVerse ?? 1) > (seg.endVerse ?? Infinity))) {
        throw new Error(`장·절 범위의 시작과 끝을 확인해 주세요: ${seg.abbr}`)
      }
    }
  }
  return segments
}

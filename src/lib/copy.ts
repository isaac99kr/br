import type { Verse } from '../types'

export function formatVersesForCopy(verses: Verse[]): string {
  if (!verses.length) return ''
  const ref = formatVerseReference(verses)
  const body = verses.map((v) => stripHeading(v.text)).filter(Boolean).join(' ')
  return body ? `${ref} ${body}` : ref
}

/** Compress selection into refs like `요20:2`, `요20:2-4`, `요20:1-2, 4-6, 8`. */
export function formatVerseReference(verses: Verse[]): string {
  if (!verses.length) return ''

  type Run = { abbr: string; chapter: number; start: number; end: number }
  const runs: Run[] = []

  for (const v of verses) {
    const last = runs[runs.length - 1]
    if (
      last &&
      last.abbr === v.abbr &&
      last.chapter === v.chapter &&
      v.verse === last.end + 1
    ) {
      last.end = v.verse
    } else {
      runs.push({ abbr: v.abbr, chapter: v.chapter, start: v.verse, end: v.verse })
    }
  }

  let out = ''
  let prevAbbr: string | null = null
  let prevChapter: number | null = null

  for (const run of runs) {
    const span = run.start === run.end ? String(run.start) : `${run.start}-${run.end}`

    if (prevAbbr === null) {
      out = `${run.abbr}${run.chapter}:${span}`
    } else if (run.abbr !== prevAbbr) {
      out += `; ${run.abbr}${run.chapter}:${span}`
    } else if (run.chapter !== prevChapter) {
      out += `, ${run.chapter}:${span}`
    } else {
      out += `, ${span}`
    }

    prevAbbr = run.abbr
    prevChapter = run.chapter
  }

  return out
}

function stripHeading(text: string): string {
  return text.replace(/^<[^>]+>\s*/, '').trim()
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

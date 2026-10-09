import type { Verse } from '../types'

export function formatVersesForCopy(verses: Verse[]): string {
  return verses
    .map((v) => `${v.abbr} ${v.chapter}:${v.verse} ${stripHeading(v.text)}`)
    .join('\n')
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

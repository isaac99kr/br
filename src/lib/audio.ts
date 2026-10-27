/** Shared reading highlights for browser TTS and chapter audio. */
export type AudioChapterCue = {
  abbr: string
  chapter: number
  announce: string
  startMs: number
  /** Occurrence in the displayed reading order, including repeated passages. */
  verseIndex?: number
}

export type AudioVerseCue = {
  abbr: string
  chapter: number
  verse: number
  startMs: number
  verseIndex?: number
}

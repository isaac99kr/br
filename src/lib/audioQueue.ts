import type { Verse } from '../types'
import type { TranslationId } from './settings'
import { chapterKey, type LoadedChapter } from './chapterAudio'

export type QueueItem = {
  kind: 'announcement' | 'passage'
  chapter: LoadedChapter
  start: number
  end: number
  queueStart: number
  verseIndex: number
  cues: { verse: number; verseEnd: number; verseIndex: number; start: number; end: number }[]
}
export type AudioQueue = { items: QueueItem[]; duration: number; combined: boolean }

export function buildAudioQueue(translation: TranslationId, verses: Verse[], chapters: Map<string, LoadedChapter>): AudioQueue {
  const items: QueueItem[] = []
  let duration = 0
  let combined = false
  let passage: QueueItem | undefined
  const append = (item: Omit<QueueItem, 'queueStart'>) => {
    const result = { ...item, queueStart: duration }
    duration += item.end - item.start
    items.push(result)
    return result
  }
  verses.forEach((verse, index) => {
    const chapter = chapters.get(chapterKey(translation, verse.abbr, verse.chapter))
    if (!chapter) throw new Error(`음원이 없습니다: ${verse.abbr}${verse.chapter}`)
    const cue = chapter.timing.verses.find(c => c.verse === verse.verse && (c.verseEnd ?? c.verse) === (verse.verseEnd ?? verse.verse))
    if (!cue) throw new Error(`본문과 음원의 절이 다릅니다: ${verse.abbr}${verse.chapter}:${verse.verse}`)
    const sr = chapter.timing.sampleRate
    const previous = verses[index - 1]
    const boundary = !previous || verse.segmentStart || previous.abbr !== verse.abbr || previous.chapter !== verse.chapter
    const contiguous = previous && (previous.verseEnd ?? previous.verse) + 1 === verse.verse
    if (boundary) {
      const announcement = chapter.timing.announcement
      const firstVerse = chapter.timing.verses[0]
      append({ kind: 'announcement', chapter, start: announcement.startSample / sr,
        // Include the configured announcement gap, then jump to the selected first verse.
        end: firstVerse.startSample / sr, verseIndex: index, cues: [] })
      passage = undefined
    }
    const c = { verse: cue.verse, verseEnd: cue.verseEnd ?? cue.verse, verseIndex: index,
      start: cue.startSample / sr, end: cue.endSample / sr }
    combined ||= c.verseEnd > c.verse
    if (passage && !boundary && contiguous && passage.chapter === chapter) {
      duration += c.end - passage.end
      passage.end = c.end
      passage.cues.push(c)
    } else {
      passage = append({ kind: 'passage', chapter, start: c.start, end: c.end, verseIndex: index, cues: [c] })
    }
  })
  if (!items.length) throw new Error('재생할 본문이 없습니다.')
  return { items, duration, combined }
}

export function queuePosition(queue: AudioQueue, time: number) {
  const clamped = Math.max(0, Math.min(time, queue.duration))
  const index = queue.items.findIndex(item => clamped < item.queueStart + item.end - item.start)
  const item = queue.items[index < 0 ? queue.items.length - 1 : index]
  return { index: index < 0 ? queue.items.length - 1 : index, item,
    sourceTime: clamped === queue.duration ? item.end : Math.max(item.start, Math.min(item.end, item.start + clamped - item.queueStart)) }
}

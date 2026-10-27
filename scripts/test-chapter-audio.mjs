import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'vite'
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } })
const originalFetch = globalThis.fetch
const originalRaf = globalThis.requestAnimationFrame
const originalCancel = globalThis.cancelAnimationFrame
globalThis.fetch = async url => {
  try { return new Response(await readFile(decodeURIComponent(String(url)).replace(/^.*?data\//, 'public/data/'))) }
  catch { return new Response('', { status: 404 }) }
}
try {
  const { loadVersesForRange } = await server.ssrLoadModule('/src/lib/bible.ts')
  const { buildAudioQueue, queuePosition } = await server.ssrLoadModule('/src/lib/audioQueue.ts')
  const { chapterKey, validateTiming } = await server.ssrLoadModule('/src/lib/chapterAudio.ts')
  const { ChapterPlayback } = await server.ssrLoadModule('/src/lib/chapterPlayback.ts')
  const cache = new Map()
  async function fixture(translation, verses) {
    const chapters = new Map()
    for (const v of verses) {
      const key = chapterKey(translation, v.abbr, v.chapter)
      if (!cache.has(key)) {
        const book = JSON.parse(await readFile(`public/data/bible/${translation}/${v.abbr}.json`, 'utf8'))
        let position = 2500
        const cues = Object.keys(book.chapters[v.chapter]).map(Number).sort((a,b) => a-b).map(verse => {
          const start = position
          position += 1000
          const cue = { verse, verseEnd: book.combinedVerses?.[v.chapter]?.[verse] ?? verse,
            startSample: start * 48, endSample: position * 48, startMs: start, endMs: position }
          position += 120
          return cue
        })
        const durationMs = position - 120
        const timing = { schemaVersion: 1, translationId: translation, book: v.abbr, abbr: v.abbr, chapter: v.chapter,
          audio: 'test.mp3', audioSha256: 'test', generationHash: 'test', sampleRate: 48000,
          totalSamples: durationMs * 48, durationMs, timeUnit: 'ms',
          announcement: { text: '장 안내', startSample: 0, endSample: 96000, startMs: 0, endMs: 2000 }, verses: cues }
        const asset = { ...timing, audioUrl: 'https://example.test/test.mp3', timingUrl: 'https://example.test/test.json', verseNumbers: cues.map(c=>c.verse) }
        validateTiming(timing, asset)
        cache.set(key, { timing, asset })
      }
      chapters.set(key, cache.get(key))
    }
    return chapters
  }
  let count = 0
  const schedules = await readdir('public/data/schedules')
  for (const translation of ['krv', 'rnksv']) {
    for (const file of schedules) {
      for (const day of JSON.parse(await readFile(`public/data/schedules/${file}`, 'utf8'))) {
        const { verses } = await loadVersesForRange(day.range, translation, true)
        const queue = buildAudioQueue(translation, verses, await fixture(translation, verses))
        const actual = queue.items.flatMap(i => i.cues.map(c => `${i.chapter.timing.abbr}/${i.chapter.timing.chapter}/${c.verse}/${c.verseIndex}`))
        assert.deepEqual(actual, verses.map((v,i) => `${v.abbr}/${v.chapter}/${v.verse}/${i}`), `${translation}/${file}/${day.day}`)
        assert.equal(queuePosition(queue, queue.duration).sourceTime, queue.items.at(-1).end)
        count++
      }
    }
  }
  for (const range of ['창1:1', '창1:10', '창1:1-10, 창1:11-20', '창1:31-2:3', '행8:26-27, 행8:1-2, 행8:26-27', '롬9:2', '시92:2', '행20:2a, 행20:2b-3']) {
    const { verses } = await loadVersesForRange(range, 'krv', true)
    const queue = buildAudioQueue('krv', verses, await fixture('krv', verses))
    assert.equal(queue.items.flatMap(i=>i.cues).length, verses.length)
    if (range === '롬9:2') { assert.equal(verses[0].verse, 1); assert.equal(verses[0].verseEnd, 2); assert.equal(queue.combined, true) }
    assert.throws(() => buildAudioQueue('krv', verses, new Map()))
  }
  const verses = (await loadVersesForRange('창1:10', 'krv', true)).verses
  const chapters = await fixture('krv', verses)
  const chapter = [...chapters.values()][0]
  const invalid = structuredClone(chapter.timing)
  invalid.verses[0].endSample += 1
  assert.throws(() => validateTiming(invalid, chapter.asset))
  const queue = buildAudioQueue('krv', verses, chapters)
  const nodes = []
  const context = { currentTime: 0, destination: {}, resume: async()=>{}, close: async()=>{},
    decodeAudioData: async()=>({duration:chapter.timing.durationMs/1000,length:chapter.timing.totalSamples,numberOfChannels:1}),
    createBufferSource() { const node = {playbackRate:{value:1}, connect(){},disconnect(){},stop(){this.stopped=true},start(...args){this.args=args}};nodes.push(node);return node } }
  globalThis.fetch = async()=>new Response(new Uint8Array([1,2]))
  globalThis.requestAnimationFrame = ()=>1
  globalThis.cancelAnimationFrame = ()=>{}
  const engine = new ChapterPlayback(queue, ()=>{}, ()=>context)
  await engine.play()
  assert.deepEqual(nodes[0].args, [0,0,2.5])
  context.currentTime = 0.5
  engine.pause()
  assert.equal(engine.state.time,0.5)
  await engine.play()
  assert.deepEqual(nodes.at(-1).args, [0,0.5,2])
  engine.seek(queue.items[1].queueStart)
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.deepEqual(nodes.at(-1).args,[0,chapter.timing.verses[9].startMs/1000,1])
  engine.setRate(2)
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(nodes.at(-1).playbackRate.value,2)
  assert.equal(nodes.at(-1).args[2],1) // duration is source seconds, not wall time
  nodes.at(-1).onended()
  assert.equal(engine.state.status,'ended')
  engine.stop()
  assert.equal(engine.state.time,0)
  engine.dispose()
  let resolveFetch
  globalThis.fetch = ()=>new Promise(resolve=>{resolveFetch=resolve})
  const stale = new ChapterPlayback(queue,()=>{},()=>context)
  const playing = stale.play()
  await new Promise(resolve=>setTimeout(resolve,0))
  stale.pause()
  const nodeCount=nodes.length
  resolveFetch(new Response(new Uint8Array([1])))
  await playing
  assert.equal(nodes.length,nodeCount,'cancelled load must never start playback')
  stale.dispose()
  console.log(`Passed: ${count} schedule/translation queues, merged verses, duplicates, reverse order, schema rejection, scheduled boundaries, pause/resume, speed, cancellation.`)
} finally {
  globalThis.fetch = originalFetch
  globalThis.requestAnimationFrame = originalRaf
  globalThis.cancelAnimationFrame = originalCancel
  await server.close()
}

import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'vite'

// Exercise the same loader as the browser with the shipped Bible files.
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } })
const originalFetch = globalThis.fetch
globalThis.fetch = async (url) => {
  const path = decodeURIComponent(String(url)).replace(/^.*?data\//, 'public/data/')
  try { return new Response(await readFile(path), { status: 200 }) }
  catch { return new Response('', { status: 404 }) }
}
try {
  const { parseReadingRange } = await server.ssrLoadModule('/src/lib/rangeParser.ts')
  const { loadVersesForRange } = await server.ssrLoadModule('/src/lib/bible.ts')
  const sample = '행18:23-19:22, 고전1-6장'
  const result = await loadVersesForRange(sample, 'krv', true)
  const refs = (result) => result.verses.map((v) => `${v.abbr}${v.chapter}:${v.verse}`)
  assert.equal(refs(result)[0], '행18:23')
  assert.equal(refs(result).at(-1), '고전6:20')
  assert.equal(refs(result)[27], '행19:22')
  assert.equal(refs(result)[28], '고전1:1')
  assert.deepEqual(refs(await loadVersesForRange(sample, 'rnksv', true)), refs(result))
  for (const input of [
    '(행18:23-19:22), (고전1-6장)',
    '（행18:23–19:22）\n（고전1～6장）',
    '행 18:23-19:22 (고전1-6장)',
    '사도행전18:23-19:22, 고린도전서1-6장',
  ]) {
    assert.deepEqual(refs(await loadVersesForRange(input, 'krv', true)), refs(result), input)
  }
  assert.deepEqual(refs(await loadVersesForRange('요3장16-18절', 'krv', true)), ['요3:16', '요3:17', '요3:18'])
  assert.equal(parseReadingRange('창1장-3장', true)[0].endChapter, 3)
  assert.equal(parseReadingRange('요1장', true)[0].abbr, '요')
  assert.equal(parseReadingRange('요1서', true)[0].abbr, '요일')
  assert.equal(parseReadingRange('요1서', true)[0].wholeBook, true)
  assert.equal(parseReadingRange('요3서', true)[0].abbr, '요삼')
  const letters = '요일1-5장, 요이1장, 요삼1장'
  for (const translation of ['krv', 'rnksv']) {
    const expected = refs(await loadVersesForRange(letters, translation, true))
    for (const input of [
      '요한일서, 요한이서, 요한삼서',
      '요1서, 요2서, 요3서',
      '요일,요이,요삼',
      '요한1서, 요한2서, 요한3서',
      '요한첫째서, 요한둘째서, 요한셋째서',
      '1요한, 2요한, 3요한',
      '1요한서, 2요한서, 3요한서',
      '요 1 서, 요 2 서, 요 3 서',
      letters,
    ]) {
      assert.deepEqual(refs(await loadVersesForRange(input, translation, true)), expected, `${translation} ${input}`)
    }
    assert.equal(expected[0], '요일1:1')
    assert.ok(expected.at(-1).startsWith('요삼1:'), expected.at(-1))
    assert.ok(expected.some((ref) => ref.startsWith('요일5:')), translation)
    assert.ok(expected.some((ref) => ref.startsWith('요이1:')), translation)
  }
  const onlyChapter = refs(await loadVersesForRange('요한일서1장', 'krv', true))
  assert.equal(onlyChapter[0], '요일1:1')
  assert.ok(onlyChapter.every((ref) => ref.startsWith('요일1:')))
  assert.deepEqual(
    refs(await loadVersesForRange('요1서1:1-3', 'krv', true)),
    ['요일1:1', '요일1:2', '요일1:3'],
  )
  assert.deepEqual(
    refs(await loadVersesForRange('유다서', 'krv', true)),
    refs(await loadVersesForRange('유1장', 'krv', true)),
  )
  assert.equal(refs(await loadVersesForRange('요3장', 'krv', true))[0], '요3:1')
  assert.equal(refs(await loadVersesForRange('요3서', 'krv', true))[0], '요삼1:1')
  for (const input of ['', '창0장', '창3-1장', '요3:18-16', '창1장, 틀린입력', '(창1장', '창1장)', '시1·2-3-4편']) {
    assert.throws(() => parseReadingRange(input, true), undefined, input)
  }
  for (const input of ['가짜1장', '창51장', '요3:999', '요3:16-999', '창1-999999999장']) {
    await assert.rejects(() => loadVersesForRange(input, 'krv', true), undefined, input)
  }
  const ordered = refs(await loadVersesForRange('행8:26-27, 행8:1-2, 행8:26-27', 'krv', true))
  assert.deepEqual(ordered, ['행8:26', '행8:27', '행8:1', '행8:2', '행8:26', '행8:27'])
  let count = 0
  for (const name of await readdir('public/data/schedules')) {
    const schedule = JSON.parse(await readFile(`public/data/schedules/${name}`, 'utf8'))
    for (const item of schedule) {
      const loaded = await loadVersesForRange(item.range, 'krv', true)
      assert.equal(loaded.linked, true, `${name}: ${item.day} ${item.range}`)
      assert.deepEqual(loaded.missing, [])
      count++
    }
  }
  console.log(`Passed: ${count} schedule days, exact verse boundaries, parentheses, aliases, invalid input, and segment order.`)
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}

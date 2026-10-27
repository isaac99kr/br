import { useRef, useState } from 'react'
import { loadVersesForRange } from '../lib/bible'
import { normalizeReadingRange } from '../lib/rangeParser'
import type { TranslationId } from '../lib/settings'

export function CollectionPage({ initialRange, translationId, onOpenReader }: {
  initialRange: string
  translationId: TranslationId
  onOpenReader: (range: string) => void
}) {
  const [range, setRange] = useState(initialRange)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const clearRange = () => {
    setRange('')
    setError(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const pasteRange = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      const textarea = textareaRef.current
      const start = textarea?.selectionStart ?? range.length
      const end = textarea?.selectionEnd ?? range.length
      const next = range.slice(0, start) + text + range.slice(end)
      setRange(next.slice(0, 4000))
      setError(null)
      requestAnimationFrame(() => {
        if (!textarea) return
        const cursor = Math.min(start + text.length, 4000)
        textarea.focus()
        textarea.setSelectionRange(cursor, cursor)
      })
    } catch {
      setError('클립보드 내용을 붙여넣으려면 브라우저의 클립보드 권한을 허용해 주세요.')
    }
  }

  return (
    <main className="page">
      <form className="panel collection-form" onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        setError(null)
        try {
          const result = await loadVersesForRange(range, translationId, true)
          if (!result.linked || result.missing.length) throw new Error('입력한 범위의 본문을 모두 불러오지 못했습니다.')
          onOpenReader(normalizeReadingRange(range))
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : '본문을 불러오지 못했습니다. 다시 시도해 주세요.')
        } finally {
          setBusy(false)
        }
      }}>
        <label htmlFor="collection-range" className="section-title">읽을 성경 범위</label>
        <p id="collection-help" className="section-desc">
          여러 범위를 쉼표나 줄바꿈으로 구분해 주세요. 입력한 순서대로 읽을 수 있어요.
        </p>
        <textarea ref={textareaRef} id="collection-range" value={range} onChange={(event) => setRange(event.target.value)}
          placeholder="행18:23-19:22, 고전1-6장" rows={4} required maxLength={4000}
          aria-describedby="collection-help collection-examples" aria-invalid={Boolean(error)} disabled={busy} />
        <div className="collection-input-actions" aria-label="입력 도구">
          <button type="button" onClick={pasteRange} disabled={busy}>클립보드에서 붙여넣기</button>
          <button type="button" onClick={clearRange} disabled={busy || !range}>입력 내용 삭제</button>
        </div>
        <p id="collection-examples" className="section-desc">
          예: 창1-3장, 요3:16-18, 시34·56편<br />
          괄호로 감싼 범위도 입력할 수 있어요: (행18:23-19:22), (고전1-6장)
        </p>
        {error && <p role="alert" className="collection-error">{error}</p>}
        <button type="submit" className="continue" disabled={busy || !range.trim()}>
          {busy ? '본문 확인 중…' : '▶ 모아읽기 시작'}
        </button>
        <p className="section-desc">읽기 화면의 신규음성에서 준비된 장의 음원을 들을 수 있습니다.</p>
      </form>
    </main>
  )
}

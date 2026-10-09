import {
  FONT_SIZE_OPTIONS,
  TRANSLATION_OPTIONS,
  type FontSize,
  type TranslationId,
} from '../lib/settings'

type Props = {
  fontSize: FontSize
  translationId: TranslationId
  onFontSizeChange: (size: FontSize) => void
  onTranslationChange: (id: TranslationId) => void
  onClose?: () => void
  embedded?: boolean
}

export function SettingsPage({
  fontSize,
  translationId,
  onFontSizeChange,
  onTranslationChange,
  onClose,
  embedded = false,
}: Props) {
  return (
    <main className={embedded ? 'settings-panel' : 'page'}>
      {onClose && (
        <div className="settings-back">
          <button type="button" className="pill" onClick={onClose}>
            닫기
          </button>
        </div>
      )}

      <h2 className="section-title">설정</h2>
      <p className="section-desc">성경 종류와 글자 크기를 고르세요. 앱 전체에 바로 적용됩니다.</p>

      <section className="panel">
        <div className="eyebrow">성경 종류</div>
        <div className="font-size-options" role="radiogroup" aria-label="성경 종류">
          {TRANSLATION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={translationId === opt.value}
              className={translationId === opt.value ? 'font-opt active' : 'font-opt'}
              onClick={() => onTranslationChange(opt.value)}
            >
              <span className="font-opt-label">{opt.label}</span>
              <span className="font-opt-sample">{opt.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="eyebrow">글자 크기</div>
        <div className="font-size-options" role="radiogroup" aria-label="글자 크기">
          {FONT_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={fontSize === opt.value}
              className={fontSize === opt.value ? 'font-opt active' : 'font-opt'}
              onClick={() => onFontSizeChange(opt.value)}
            >
              <span className="font-opt-label">{opt.label}</span>
              <span className="font-opt-sample" data-preview={opt.value}>
                태초에 하나님이 천지를 창조하시니라
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="eyebrow">글꼴</div>
        <p className="settings-note">
          앱 글꼴은 가독성을 위해 <strong>Pretendard</strong>(무료, SIL OFL)로 고정되어 있습니다.
        </p>
      </section>
    </main>
  )
}

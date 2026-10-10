import {
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  TRANSLATION_OPTIONS,
  VERSE_GAP_OPTIONS,
  VOICE_OPTIONS,
  type FontSize,
  type SpacingSize,
  type TranslationId,
  type VoiceGender,
} from '../lib/settings'

type Props = {
  fontSize: FontSize
  verseGap: SpacingSize
  lineHeight: SpacingSize
  translationId: TranslationId
  voiceGender: VoiceGender
  onFontSizeChange: (size: FontSize) => void
  onVerseGapChange: (size: SpacingSize) => void
  onLineHeightChange: (size: SpacingSize) => void
  onTranslationChange: (id: TranslationId) => void
  onVoiceGenderChange: (voice: VoiceGender) => void
  onClose?: () => void
  embedded?: boolean
}

export function SettingsPage({
  fontSize,
  verseGap,
  lineHeight,
  translationId,
  voiceGender,
  onFontSizeChange,
  onVerseGapChange,
  onLineHeightChange,
  onTranslationChange,
  onVoiceGenderChange,
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
      <p className="section-desc">성경 종류·음성·글자 크기·간격을 고르세요. 앱 전체에 바로 적용됩니다.</p>

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

      {VOICE_OPTIONS.length > 1 ? (
        <section className="panel">
          <div className="eyebrow">음성</div>
          <div className="font-size-options" role="radiogroup" aria-label="음성">
            {VOICE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={voiceGender === opt.value}
                className={voiceGender === opt.value ? 'font-opt active' : 'font-opt'}
                onClick={() => onVoiceGenderChange(opt.value)}
              >
                <span className="font-opt-label">{opt.label}</span>
                <span className="font-opt-sample">{opt.description}</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="eyebrow">음성</div>
          <div className="font-size-options">
            <div className="font-opt active" aria-label="음성">
              <span className="font-opt-label">여성</span>
              <span className="font-opt-sample">Angelina</span>
            </div>
          </div>
        </section>
      )}

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
        <div className="eyebrow">절 간 간격</div>
        <div className="font-size-options" role="radiogroup" aria-label="절 간 간격">
          {VERSE_GAP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={verseGap === opt.value}
              className={verseGap === opt.value ? 'font-opt active' : 'font-opt'}
              onClick={() => onVerseGapChange(opt.value)}
            >
              <span className="font-opt-label">{opt.label}</span>
              <span className="font-opt-sample">{opt.sample}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="eyebrow">행간</div>
        <div className="font-size-options" role="radiogroup" aria-label="행간">
          {LINE_HEIGHT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={lineHeight === opt.value}
              className={lineHeight === opt.value ? 'font-opt active' : 'font-opt'}
              onClick={() => onLineHeightChange(opt.value)}
            >
              <span className="font-opt-label">{opt.label}</span>
              <span className="font-opt-sample">{opt.sample}</span>
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

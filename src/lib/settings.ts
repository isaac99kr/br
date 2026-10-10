export type FontSize = 'S' | 'M' | 'L' | 'XL'

export type SpacingSize = 'S' | 'M' | 'L' | 'XL'

export type TranslationId = 'krv' | 'rnksv'

export type VoiceGender = 'female' | 'male'

export type AppSettings = {
  version: number
  fontSize: FontSize
  verseGap: SpacingSize
  lineHeight: SpacingSize
  translationId: TranslationId
  voiceGender: VoiceGender
}

export const SETTINGS_KEY = 'bibleReadingSettings:v1'

export const FONT_SIZE_OPTIONS: { value: FontSize; label: string; sample: string }[] = [
  { value: 'S', label: '작게', sample: '15px' },
  { value: 'M', label: '보통', sample: '18px' },
  { value: 'L', label: '크게', sample: '23px' },
  { value: 'XL', label: '아주 크게', sample: '28px' },
]

export const VERSE_GAP_OPTIONS: { value: SpacingSize; label: string; sample: string }[] = [
  { value: 'S', label: '붙임', sample: '간격 없음' },
  { value: 'M', label: '보통', sample: '기본' },
  { value: 'L', label: '넓게', sample: '여유' },
  { value: 'XL', label: '아주 넓게', sample: '넉넉' },
]

export const LINE_HEIGHT_OPTIONS: { value: SpacingSize; label: string; sample: string }[] = [
  { value: 'S', label: '좁게', sample: '1.5' },
  { value: 'M', label: '보통', sample: '1.8' },
  { value: 'L', label: '넓게', sample: '2.05' },
  { value: 'XL', label: '아주 넓게', sample: '2.3' },
]

export const TRANSLATION_OPTIONS: {
  value: TranslationId
  label: string
  description: string
}[] = [
  {
    value: 'krv',
    label: '개역개정',
    description: '대한성서공회 개역개정',
  },
  {
    value: 'rnksv',
    label: '표준새번역',
    description: '대한성서공회 표준새번역개정',
  },
]

export const VOICE_OPTIONS: {
  value: VoiceGender
  label: string
  description: string
}[] = [
  {
    value: 'female',
    label: '여성',
    description: 'Angelina',
  },
]

const DEFAULT: AppSettings = {
  version: 1,
  fontSize: 'M',
  verseGap: 'M',
  lineHeight: 'M',
  translationId: 'krv',
  voiceGender: 'female',
}

function isSpacingSize(v: unknown): v is SpacingSize {
  return v === 'S' || v === 'M' || v === 'L' || v === 'XL'
}

function isFontSize(v: unknown): v is FontSize {
  return isSpacingSize(v)
}

function isTranslationId(v: unknown): v is TranslationId {
  return v === 'krv' || v === 'rnksv'
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      version: 1,
      fontSize: isFontSize(parsed.fontSize) ? parsed.fontSize : 'M',
      verseGap: isSpacingSize(parsed.verseGap) ? parsed.verseGap : 'M',
      lineHeight: isSpacingSize(parsed.lineHeight) ? parsed.lineHeight : 'M',
      translationId: isTranslationId(parsed.translationId) ? parsed.translationId : 'krv',
      // Male track disabled for Supertonic Angelina rollout — coerce legacy male → female.
      voiceGender: 'female',
    }
  } catch {
    return { ...DEFAULT }
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

export function applyFontSize(size: FontSize): void {
  document.documentElement.dataset.fontSize = size
}

export function applyReadingLayout(settings: Pick<AppSettings, 'fontSize' | 'verseGap' | 'lineHeight'>): void {
  const root = document.documentElement
  root.dataset.fontSize = settings.fontSize
  root.dataset.verseGap = settings.verseGap
  root.dataset.lineHeight = settings.lineHeight
}

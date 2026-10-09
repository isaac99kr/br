export type FontSize = 'S' | 'M' | 'L' | 'XL'

export type TranslationId = 'krv' | 'rnksv'

export type AppSettings = {
  version: number
  fontSize: FontSize
  translationId: TranslationId
}

export const SETTINGS_KEY = 'bibleReadingSettings:v1'

export const FONT_SIZE_OPTIONS: { value: FontSize; label: string; sample: string }[] = [
  { value: 'S', label: '작게', sample: '15px' },
  { value: 'M', label: '보통', sample: '17px' },
  { value: 'L', label: '크게', sample: '19px' },
  { value: 'XL', label: '아주 크게', sample: '22px' },
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

const DEFAULT: AppSettings = { version: 1, fontSize: 'M', translationId: 'krv' }

function isFontSize(v: unknown): v is FontSize {
  return v === 'S' || v === 'M' || v === 'L' || v === 'XL'
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
      translationId: isTranslationId(parsed.translationId) ? parsed.translationId : 'krv',
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

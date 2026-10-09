import { useCallback, useEffect, useState } from 'react'
import {
  applyFontSize,
  loadSettings,
  saveSettings,
  type AppSettings,
  type FontSize,
  type TranslationId,
} from '../lib/settings'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())

  useEffect(() => {
    applyFontSize(settings.fontSize)
    saveSettings(settings)
  }, [settings])

  const setFontSize = useCallback((fontSize: FontSize) => {
    setSettings((prev) => ({ ...prev, fontSize }))
  }, [])

  const setTranslationId = useCallback((translationId: TranslationId) => {
    setSettings((prev) => ({ ...prev, translationId }))
  }, [])

  return {
    settings,
    setFontSize,
    setTranslationId,
    fontSize: settings.fontSize,
    translationId: settings.translationId,
  }
}

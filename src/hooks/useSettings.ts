import { useCallback, useEffect, useState } from 'react'
import {
  applyReadingLayout,
  loadSettings,
  saveSettings,
  type AppSettings,
  type FontSize,
  type SpacingSize,
  type TranslationId,
  type VoiceGender,
} from '../lib/settings'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())

  useEffect(() => {
    applyReadingLayout(settings)
    saveSettings(settings)
  }, [settings])

  const setFontSize = useCallback((fontSize: FontSize) => {
    setSettings((prev) => ({ ...prev, fontSize }))
  }, [])

  const setVerseGap = useCallback((verseGap: SpacingSize) => {
    setSettings((prev) => ({ ...prev, verseGap }))
  }, [])

  const setLineHeight = useCallback((lineHeight: SpacingSize) => {
    setSettings((prev) => ({ ...prev, lineHeight }))
  }, [])

  const setTranslationId = useCallback((translationId: TranslationId) => {
    setSettings((prev) => ({ ...prev, translationId }))
  }, [])

  const setVoiceGender = useCallback((voiceGender: VoiceGender) => {
    setSettings((prev) => ({ ...prev, voiceGender }))
  }, [])

  return {
    settings,
    setFontSize,
    setVerseGap,
    setLineHeight,
    setTranslationId,
    setVoiceGender,
    fontSize: settings.fontSize,
    verseGap: settings.verseGap,
    lineHeight: settings.lineHeight,
    translationId: settings.translationId,
    voiceGender: settings.voiceGender,
  }
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatScheduleDayLabel, getItem } from '../lib/schedule'
import type { FontSize, SpacingSize, TranslationId } from '../lib/settings'
import { SettingsPage } from './SettingsPage'
import type { ScheduleItem, ScheduleMeta } from '../types'
import type { useProgress } from '../hooks/useProgress'

type ProgressApi = ReturnType<typeof useProgress>

type Props = {
  schedule: ScheduleItem[]
  scheduleMeta: ScheduleMeta
  scheduleOptions: ScheduleMeta[]
  scheduleId: string
  onScheduleChange: (id: string) => void
  progress: ProgressApi
  onOpenReader: (day: number) => void
  fontSize: FontSize
  verseGap: SpacingSize
  lineHeight: SpacingSize
  translationId: TranslationId
  onFontSizeChange: (size: FontSize) => void
  onVerseGapChange: (size: SpacingSize) => void
  onLineHeightChange: (size: SpacingSize) => void
  onTranslationChange: (id: TranslationId) => void
}

export function HomePage({
  schedule,
  scheduleMeta,
  scheduleOptions,
  scheduleId,
  onScheduleChange,
  progress,
  onOpenReader,
  fontSize,
  verseGap,
  lineHeight,
  translationId,
  onFontSizeChange,
  onVerseGapChange,
  onLineHeightChange,
  onTranslationChange,
}: Props) {
  const total = schedule.length
  const { completedCount, percent, continueDay } = progress
  const item = getItem(schedule, continueDay)
  const allDone = completedCount === total && total > 0
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (settingsOpen) {
      document.body.classList.add('settings-overlay-open')
    } else {
      document.body.classList.remove('settings-overlay-open')
    }
    return () => document.body.classList.remove('settings-overlay-open')
  }, [settingsOpen])

  const nextLabel = item
    ? `${formatScheduleDayLabel(item)} · ${item.range}`
    : '첫 번째 일정부터 시작해보세요.'

  return (
    <main className="page">
      <section className="panel">
        <div className="home-plan-row">
          <div className="home-plan-info">
            <div className="eyebrow">읽기 일정</div>
            <div className="home-plan-title">{scheduleMeta.title}</div>
          </div>
          <button type="button" className="pill" onClick={() => setSettingsOpen(true)}>
            설정
          </button>
        </div>

        <div className="progress-head">
          <div>
            <div className="big">
              <span>{completedCount}</span>
              <span className="muted unit"> / {total}일</span>
            </div>
            <div className="muted small">완료한 읽기</div>
          </div>
          <div className="big percent">{percent}%</div>
        </div>
        <div className="bar" aria-hidden="true">
          <div className="fill" style={{ width: `${percent}%` }} />
        </div>

        <button type="button" className="continue" onClick={() => onOpenReader(continueDay)}>
          {allDone ? '✓ 모두 읽었어요' : '▶ 이어 읽기'}
        </button>
        <div className="nextline">{nextLabel}</div>

        <div className="home-actions">
          <Link to="/find" className="pill link-pill">
            날짜 찾기 →
          </Link>
        </div>
      </section>

      {settingsOpen && (
        <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="설정">
          <button
            type="button"
            className="settings-overlay-backdrop"
            aria-label="설정 닫기"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="settings-overlay-sheet">
            <SettingsPage
              embedded
              fontSize={fontSize}
              verseGap={verseGap}
              lineHeight={lineHeight}
              translationId={translationId}
              scheduleId={scheduleId}
              scheduleOptions={scheduleOptions}
              onFontSizeChange={onFontSizeChange}
              onVerseGapChange={onVerseGapChange}
              onLineHeightChange={onLineHeightChange}
              onTranslationChange={onTranslationChange}
              onScheduleChange={(id) => {
                onScheduleChange(id)
                setSettingsOpen(false)
              }}
              onClose={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}
    </main>
  )
}

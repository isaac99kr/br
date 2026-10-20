import { useEffect, useState } from 'react'
import {
  HashRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useMatch,
  useNavigate,
} from 'react-router-dom'
import { ReaderScreen } from './components/ReaderScreen'
import { useProgress } from './hooks/useProgress'
import { useSettings } from './hooks/useSettings'
import { hasIncompleteBefore } from './lib/progress'
import {
  getScheduleMeta,
  loadSchedule,
  loadScheduleCatalog,
  resolveScheduleId,
} from './lib/schedule'
import { CollectionPage } from './pages/CollectionPage'
import { FindPage } from './pages/FindPage'
import { HomePage } from './pages/HomePage'
import type { ScheduleCatalog, ScheduleItem, ScheduleMeta } from './types'
import './styles.css'

type LoadedSchedule = {
  catalog: ScheduleCatalog
  scheduleId: string
  meta: ScheduleMeta
  schedule: ScheduleItem[]
}

function AppRoutes({
  catalog,
  meta,
  schedule,
  scheduleId,
  settings,
}: {
  catalog: ScheduleCatalog
  meta: ScheduleMeta
  schedule: ScheduleItem[]
  scheduleId: string
  settings: ReturnType<typeof useSettings>
}) {
  const progress = useProgress(scheduleId, schedule.length)
  const {
    fontSize,
    setFontSize,
    verseGap,
    setVerseGap,
    lineHeight,
    setLineHeight,
    translationId,
    setTranslationId,
    setScheduleId,
    ttsVoiceUri,
    setTtsVoiceUri,
  } = settings
  const navigate = useNavigate()
  const location = useLocation()
  const readMatch = useMatch('/read/:day')
  const rawDay = readMatch ? Number(readMatch.params.day) : NaN
  const readerDay =
    Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= schedule.length ? rawDay : null

  const collectionRange = location.pathname === '/collection/read'
    ? new URLSearchParams(location.search).get('range') : null
  const collectionProgress = useProgress(`collection:${collectionRange ?? ''}`, 1)
  const showCollection = location.pathname.startsWith('/collection')
  const showFind = location.pathname.startsWith('/find')

  const openReader = (day: number) => {
    if (day > 1 && hasIncompleteBefore(progress.store, day)) {
      const ok = window.confirm(
        `이전 날짜(1~${day - 1}일)를 모두 읽은 것으로 표시할까요?`,
      )
      if (ok) progress.completeDaysBefore(day)
    }
    navigate(`/read/${day}`, { state: { from: showFind ? '/find' : '/' } })
  }

  const closeReader = () => {
    const from = (location.state as { from?: string } | null)?.from
    navigate(showCollection ? `/collection?range=${encodeURIComponent(collectionRange ?? '')}` : from === '/find' ? '/find' : '/')
  }

  if (readerDay != null || collectionRange) {
    return (
      <ReaderScreen
        key={collectionRange ?? 'schedule'}
        collection={Boolean(collectionRange)}
        day={collectionRange ? 1 : readerDay!}
        schedule={collectionRange ? [{ day: 1, range: collectionRange }] : schedule}
        scheduleMeta={collectionRange ? { ...meta, title: '모아읽기' } : meta}
        progress={collectionRange ? collectionProgress : progress}
        translationId={translationId}
        ttsVoiceUri={ttsVoiceUri}
        onTtsVoiceUriChange={setTtsVoiceUri}
        fontSize={fontSize}
        verseGap={verseGap}
        lineHeight={lineHeight}
        onFontSizeChange={setFontSize}
        onVerseGapChange={setVerseGap}
        onLineHeightChange={setLineHeight}
        onTranslationChange={setTranslationId}
        onClose={closeReader}
        onChangeDay={(d) =>
          navigate(`/read/${d}`, { replace: true, state: location.state })
        }
      />
    )
  }

  const title = showCollection ? '원하는 말씀, 모아읽기' : showFind ? '날짜별 읽기 일정' : '오늘의 말씀, 한 걸음씩'
  const sub = showCollection ? '읽고 싶은 성경 범위를 직접 입력해 보세요.' : showFind
    ? meta.groupMode === 'month'
      ? '월별로 일정을 확인하고 날짜를 고르세요.'
      : '구약과 신약을 주차별로 확인하세요.'
    : '읽던 곳에서 이어서 읽어보세요.'

  return (
    <>
      <div className="app">
        <header className="top">
          <div className="top-row">
            <div className="brand">BIBLE READING JOURNEY</div>
          </div>
          <h1>{title}</h1>
          <p className="sub">{sub}</p>
        </header>

        <nav className="tabs" aria-label="주요 메뉴">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            홈
          </NavLink>
          <NavLink to="/find" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            날짜 찾기
          </NavLink>
          <NavLink to="/collection" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            모아읽기
          </NavLink>
        </nav>

        {showCollection ? (
          <CollectionPage initialRange={new URLSearchParams(location.search).get('range') ?? ''} translationId={translationId} onOpenReader={(range) =>
            navigate(`/collection/read?range=${encodeURIComponent(range)}`)} />
        ) : showFind ? (
          <FindPage
            schedule={schedule}
            scheduleMeta={meta}
            progress={progress}
            onOpenReader={openReader}
          />
        ) : (
          <HomePage
            schedule={schedule}
            scheduleMeta={meta}
            scheduleOptions={catalog.schedules}
            scheduleId={scheduleId}
            onScheduleChange={setScheduleId}
            progress={progress}
            onOpenReader={openReader}
          />
        )}
      </div>

      <Routes>
        <Route path="/" element={null} />
        <Route path="/collection" element={null} />
        <Route path="/collection/read" element={null} />
        <Route path="/find" element={null} />
        <Route path="/settings" element={<Navigate to="/" replace />} />
        <Route path="/read/:day" element={null} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  const settings = useSettings()
  const { scheduleId: preferredScheduleId, setScheduleId } = settings
  const [loaded, setLoaded] = useState<LoadedSchedule | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const catalog = await loadScheduleCatalog()
        const scheduleId = resolveScheduleId(catalog, preferredScheduleId)
        if (scheduleId !== preferredScheduleId) {
          setScheduleId(scheduleId)
        }
        const meta = getScheduleMeta(catalog, scheduleId)
        if (!meta) throw new Error(`알 수 없는 일정: ${scheduleId}`)
        const schedule = await loadSchedule(scheduleId)
        if (cancelled) return
        setLoaded({ catalog, scheduleId, meta, schedule })
        setError(null)
      } catch (e: unknown) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '일정 로드 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [preferredScheduleId, setScheduleId])

  if (error) {
    return (
      <div className="boot-error">
        <h1>일정을 불러오지 못했습니다</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="boot-loading">
        <p>일정을 불러오는 중…</p>
      </div>
    )
  }

  return (
    <HashRouter>
      <AppRoutes
        catalog={loaded.catalog}
        meta={loaded.meta}
        schedule={loaded.schedule}
        scheduleId={loaded.scheduleId}
        settings={settings}
      />
    </HashRouter>
  )
}

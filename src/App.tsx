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
import { ReaderModal } from './components/ReaderModal'
import { useProgress } from './hooks/useProgress'
import { loadSchedule } from './lib/schedule'
import { FindPage } from './pages/FindPage'
import { HomePage } from './pages/HomePage'
import type { ScheduleItem } from './types'
import './styles.css'

function AppRoutes({ schedule }: { schedule: ScheduleItem[] }) {
  const progress = useProgress(schedule.length)
  const navigate = useNavigate()
  const location = useLocation()
  const readMatch = useMatch('/read/:day')
  const rawDay = readMatch ? Number(readMatch.params.day) : NaN
  const readerDay =
    Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= schedule.length ? rawDay : null

  const showFind =
    readerDay != null
      ? (location.state as { from?: string } | null)?.from === '/find' ||
        location.pathname.startsWith('/find')
      : location.pathname.startsWith('/find')

  const openReader = (day: number) => {
    const from = location.pathname.startsWith('/find') ? '/find' : '/'
    navigate(`/read/${day}`, { state: { from } })
  }

  const closeReader = () => {
    const from = (location.state as { from?: string } | null)?.from
    navigate(from === '/find' ? '/find' : '/')
  }

  return (
    <>
      <div className="app">
        <header className="top">
          <div className="brand">BIBLE READING JOURNEY</div>
          <h1>{showFind ? '날짜별 읽기 일정' : '오늘의 말씀, 한 걸음씩'}</h1>
          <p className="sub">
            {showFind
              ? '구약과 신약을 주차별로 확인하세요.'
              : '읽던 곳에서 이어서 읽어보세요.'}
          </p>
        </header>

        <nav className="tabs" aria-label="주요 메뉴">
          <NavLink
            to="/"
            end
            className={() => (!showFind ? 'tab active' : 'tab')}
            onClick={(e) => {
              if (readerDay != null) {
                e.preventDefault()
                navigate('/')
              }
            }}
          >
            홈
          </NavLink>
          <NavLink
            to="/find"
            className={() => (showFind ? 'tab active' : 'tab')}
            onClick={(e) => {
              if (readerDay != null) {
                e.preventDefault()
                navigate('/find')
              }
            }}
          >
            날짜 찾기
          </NavLink>
        </nav>

        {showFind ? (
          <FindPage schedule={schedule} progress={progress} onOpenReader={openReader} />
        ) : (
          <HomePage schedule={schedule} progress={progress} onOpenReader={openReader} />
        )}
      </div>

      <Routes>
        <Route path="/" element={null} />
        <Route path="/find" element={null} />
        <Route path="/read/:day" element={null} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <ReaderModal
        day={readerDay}
        schedule={schedule}
        progress={progress}
        onClose={closeReader}
        onChangeDay={(d) =>
          navigate(`/read/${d}`, { replace: true, state: location.state })
        }
      />
    </>
  )
}

export default function App() {
  const [schedule, setSchedule] = useState<ScheduleItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSchedule()
      .then(setSchedule)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '일정 로드 실패'))
  }, [])

  if (error) {
    return (
      <div className="boot-error">
        <h1>일정을 불러오지 못했습니다</h1>
        <p>{error}</p>
      </div>
    )
  }

  if (!schedule) {
    return (
      <div className="boot-loading">
        <p>일정을 불러오는 중…</p>
      </div>
    )
  }

  return (
    <HashRouter>
      <AppRoutes schedule={schedule} />
    </HashRouter>
  )
}

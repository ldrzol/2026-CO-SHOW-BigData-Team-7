import { useState, useEffect } from 'react'
import './App.css'
import './report.css'
import Splash from './pages/Splash.jsx'
import Login from './pages/Login.jsx'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './lib/firebase.js'
import Nickname from './pages/Nickname.jsx'
import Home from './pages/Home.jsx'
import Analyze from './pages/Analyze.jsx'
import CareGuide from './pages/CareGuide.jsx'
import Book from './pages/Book.jsx'
import Friend from './pages/Friend.jsx'
import Setting from './pages/Setting.jsx'
import Backup from './pages/Backup.jsx'
import Storage from './pages/Storage.jsx'
import Notice from './pages/Notice.jsx'
import Write from './pages/Write.jsx'
import Customize from './pages/Customize.jsx'
import AnalyzeDetail from './pages/AnalyzeDetail.jsx'
import AnalyzeReport from './pages/AnalyzeReport.jsx'

import BottomNav from './components/BottomNav.jsx'

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [user, setUser] = useState() // undefined: 로그인 상태 확인 중, null: 로그아웃 상태
  const [profile, setProfile] = useState() // undefined: 불러오는 중, null: 아직 프로필 없음(첫 로그인)
  const location = useLocation()

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setProfile(undefined) // 계정이 바뀌면 프로필을 다시 불러와요
        setUser(u)
      }),
    [],
  )

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => setProfile(snap.exists() ? snap.data() : null))
      .catch((e) => {
        console.error(e)
        setProfile(null)
      })
  }, [user])

  // 스플래시·로그인·닉네임은 노란 화면이라 캔버스(html) 배경도 같이 노랗게 둬요.
  // 안 그러면 상태바 뒤나 오버스크롤 영역이 흰색으로 비쳐요
  const splash = showSplash || user === undefined || (user && profile === undefined)
  const brand = splash || (user && !profile)
  const onLogin = location.pathname === '/login'
  useEffect(() => {
    if (onLogin) return // 로그인 화면은 Login 이 직접 칠해요 (첫 화면 노랑 / 이메일 화면 흰색)
    document.documentElement.classList.toggle('is-brand', !!brand)
  }, [brand, onLogin])

  if (splash) return <Splash />

  const isLoginPage = location.pathname === '/login'
  if (!user && !isLoginPage) return <Navigate to="/login" replace />
  if (user && isLoginPage) return <Navigate to="/" replace />
  if (user && !profile) return <Nickname user={user} onDone={setProfile} />
  if (user && !profile.character) return <Customize user={user} profile={profile} onDone={setProfile} />

  const showNav = !['/login', '/write', '/setting/customize'].includes(location.pathname)

  return (
    <>
      <main className={showNav ? 'page' : 'page page--full'}>
        <Routes>
          <Route path="/analyze/detail" element={<AnalyzeDetail />} />
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/analyze/care" element={<CareGuide />} />
          <Route path="/analyze/report" element={<AnalyzeReport />} />
          <Route path="/book" element={<Book />} />
          <Route path="/friend" element={<Friend profile={profile} />} />
          <Route path="/setting" element={<Setting profile={profile} onProfileChange={setProfile} />} />
          <Route path="/setting/backup" element={<Backup />} />
          <Route path="/setting/storage" element={<Storage />} />
          <Route path="/setting/notice" element={<Notice />} />
          <Route path="/setting/customize" element={<Customize user={user} profile={profile} onDone={setProfile} />} />
          <Route path="/write" element={<Write profile={profile} />} />
        </Routes>
      </main>
      {showNav && <BottomNav />}
      </>
  )
}

export default App
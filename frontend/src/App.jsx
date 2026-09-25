import { useState, useEffect } from 'react'
import './App.css'
import Splash from './pages/Splash.jsx'
import Login from './pages/Login.jsx'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './lib/firebase.js'
import Nickname from './pages/Nickname.jsx'
import Home from './pages/Home.jsx'
import Analyze from './pages/Analyze.jsx'
import Book from './pages/Book.jsx'
import Friend from './pages/Friend.jsx'
import Setting from './pages/Setting.jsx'
import Backup from './pages/Backup.jsx'
import Storage from './pages/Storage.jsx'
import Notice from './pages/Notice.jsx'
import Write from './pages/Write.jsx'

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

  if (showSplash || user === undefined || (user && profile === undefined)) {
    return <Splash />
  }

  const isLoginPage = location.pathname === '/login'
  if (!user && !isLoginPage) return <Navigate to="/login" replace />
  if (user && isLoginPage) return <Navigate to="/" replace />
  if (user && !profile) return <Nickname user={user} onDone={setProfile} />

  return (
    <>
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/book" element={<Book />} />
          <Route path="/friend" element={<Friend profile={profile} />} />
          <Route path="/setting" element={<Setting profile={profile} />} />
          <Route path="/setting/backup" element={<Backup />} />
          <Route path="/setting/storage" element={<Storage />} />
          <Route path="/setting/notice" element={<Notice />} />
          <Route path="/write" element={<Write />} />
        </Routes>
      </main>
      {!['/login', '/write'].includes(location.pathname) && <BottomNav />}
    </>
  )
}

export default App
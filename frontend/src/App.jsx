import { useState, useEffect } from 'react'
import './App.css'
import Splash from './pages/Splash.jsx'
import Login from './pages/Login.jsx'
import { Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Analyze from './pages/Analyze.jsx'
import Book from './pages/Book.jsx'
import Friend from './pages/Friend.jsx'
import Setting from './pages/Setting.jsx'
import Write from './pages/Write.jsx'

import BottomNav from './components/BottomNav.jsx'

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const location = useLocation()

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500)
    return () => clearTimeout(timer)
  }, [])

  if (showSplash) {
    return <Splash />
  }

  return (
    <>
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/book" element={<Book />} />
          <Route path="/friend" element={<Friend />} />
          <Route path="/setting" element={<Setting />} />
          <Route path="/write" element={<Write />} />
        </Routes>
      </main>
      {!['/login', '/write'].includes(location.pathname) && <BottomNav />}
    </>
  )
}

export default App
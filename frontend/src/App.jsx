import { useState, useEffect } from 'react'
import './App.css'
import Splash from './pages/Splash.jsx'
import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Diary from './pages/Diary.jsx'
import Book from './pages/Book.jsx'
import Friend from './pages/Friend.jsx'
import My from './pages/My.jsx'

import BottomNav from './components/BottomNav.jsx'

function App() {
  const [showSplash, setShowSplash] = useState(true)

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
          <Route path="/diary" element={<Diary />} />
          <Route path="/book" element={<Book />} />
          <Route path="/friend" element={<Friend />} />
          <Route path="/my" element={<My />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  )
}

export default App

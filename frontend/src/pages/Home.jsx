import { PencilSimple } from '@phosphor-icons/react'
import Calendar from '../components/Calendar.jsx'
import { useNavigate } from 'react-router-dom'

function Home() {
  const navigate = useNavigate()
  const entries = {
    // '2026-09-05': '😊',
  }

  function handleDateClick(dateKey) {
    // TODO: 해당 날짜 일기 쓰기/보기 화면으로 이동
    console.log(dateKey)
  }

  function handleWriteDiary() {
    // TODO: 일기 작성 화면으로 이동
    navigate('/write')
  }

  return (
    <main>
      <Calendar entries={entries} onDateClick={handleDateClick} />
      <button type="button" className="fab" onClick={handleWriteDiary} aria-label="일기 작성">
        <PencilSimple size={24} weight="bold" />
      </button>
    </main>
  )
}

export default Home

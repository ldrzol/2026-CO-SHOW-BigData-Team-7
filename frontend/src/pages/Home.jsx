import { useEffect, useRef, useState } from 'react'
import { PencilSimple, X } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import Calendar from '../components/Calendar.jsx'
import { auth, db } from '../lib/firebase.js'
import { dateLabel, emotionIcon, todayKey } from '../lib/report.js'

function Home() {
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState({}) // { '2026-10-03': { title, body, ... } }
  const [openKey, setOpenKey] = useState(null)
  const dialog = useRef(null)

  // 일기는 하루 한 편이라 전부 읽어도 1년에 365개예요.
  // onSnapshot 이라 저장된 사본이 먼저 뜨고, 서버 응답이 오면 조용히 갱신돼요
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users', auth.currentUser.uid, 'diaries'),
        (snap) =>
          setDiaries(
            Object.fromEntries(
              snap.docs
                .map((d) => d.data())
                .filter((d) => !d.isDeleted && d.diaryDate)
                .map((d) => [d.diaryDate, d]),
            ),
          ),
        console.error,
      ),
    [],
  )

  const entries = Object.fromEntries(
    Object.entries(diaries)
      .filter(([, d]) => emotionIcon(d.userEmotion))
      .map(([key, d]) => [key, emotionIcon(d.userEmotion)]),
  )

  function handleDateClick(key) {
    if (!diaries[key]) return // 일기 없는 날은 그냥 넘어가요
    setOpenKey(key)
    dialog.current.showModal() // Esc 닫기·배경 어둡게는 <dialog> 가 알아서 해줘요
  }

  const diary = openKey && diaries[openKey]
  const today = todayKey()

  return (
    <main className="home">
      <header className="home__header">
        <img src="/icon-192.png" alt="" className="home__logo" />
        <div>
          <p className="home__brand">삐뚤</p>
          <p className="home__today">{dateLabel(today)}</p>
        </div>
      </header>

      <Calendar entries={entries} onDateClick={handleDateClick} />

      <button
        type="button"
        className="fab"
        onClick={() => navigate(diaries[today] ? `/write?date=${today}` : '/write')}
        aria-label={diaries[today] ? '오늘 일기 수정' : '일기 작성'}
      >
        <PencilSimple size={24} weight="bold" />
      </button>

      <dialog
        ref={dialog}
        className="diary"
        onClose={() => setOpenKey(null)}
        onClick={(e) => e.target === dialog.current && dialog.current.close()}
      >
        {diary && (
          <>
            <header className="diary__header">
              <p className="diary__date">{dateLabel(openKey)}</p>
              <button type="button" className="diary__close" onClick={() => dialog.current.close()} aria-label="닫기">
                <X size={18} />
              </button>
            </header>
            {diary.imageUrl ? (
              <img src={diary.imageUrl} alt="그림일기" className="diary__image" />
            ) : (
              <p className="diary__empty">그림은 아직 없어요</p>
            )}
            {diary.title && <p className="diary__title">{diary.title}</p>}
            <p className="diary__body">{diary.body}</p>
            <button type="button" className="diary__edit" onClick={() => navigate(`/write?date=${openKey}`)}>
              이 날 일기 수정하기
            </button>
          </>
        )}
      </dialog>
    </main>
  )
}

export default Home

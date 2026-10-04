import { useEffect, useRef, useState } from 'react'
import { PencilSimple, X } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import Calendar from '../components/Calendar.jsx'
import { auth, db } from '../lib/firebase.js'
import { dateLabel, emotionIcon } from '../lib/report.js'

function Home() {
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState({}) // { '2026-10-03': { title, body, ... } }
  const [openKey, setOpenKey] = useState(null)
  const dialog = useRef(null)

  // 일기는 하루 한 편이라 전부 읽어도 1년에 365개예요. 오프라인 캐시가 있어서 두 번째부터는 바로 떠요
  useEffect(() => {
    getDocs(collection(db, 'users', auth.currentUser.uid, 'diaries'))
      .then((snap) =>
        setDiaries(
          Object.fromEntries(
            snap.docs
              .map((d) => d.data())
              .filter((d) => !d.isDeleted && d.diaryDate)
              .map((d) => [d.diaryDate, d]),
          ),
        ),
      )
      .catch(console.error)
  }, [])

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

  return (
    <main>
      <Calendar entries={entries} onDateClick={handleDateClick} />
      <button type="button" className="fab" onClick={() => navigate('/write')} aria-label="일기 작성">
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
          </>
        )}
      </dialog>
    </main>
  )
}

export default Home

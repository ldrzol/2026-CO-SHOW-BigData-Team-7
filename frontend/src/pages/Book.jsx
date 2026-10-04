import { useEffect, useMemo, useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { collection, getDocs } from 'firebase/firestore'
import { auth, db } from '../lib/firebase.js'
import { dateLabel, emotionIcon, todayKey } from '../lib/report.js'

const thisMonth = () => todayKey().slice(0, 7)

// '2026-03' 에서 n개월 이동
const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}

function BookPage({ entry }) {
  const icon = emotionIcon(entry.userEmotion)
  return (
    <section className="book__page">
      <div className="book__meta">
        <span>{dateLabel(entry.diaryDate)}</span>
        {icon && <img src={icon} alt={entry.userEmotion} className="book__mood" />}
      </div>
      <div className="book__picture">
        {entry.imageUrl ? <img src={entry.imageUrl} alt="그림일기" /> : <p className="book__empty">그림은 아직 없어요</p>}
      </div>
      {entry.title && <p className="book__title">{entry.title}</p>}
      <p className="book__text">{entry.body}</p>
    </section>
  )
}

function Book() {
  const [all, setAll] = useState(null) // null: 불러오는 중
  const [month, setMonth] = useState(thisMonth())
  const [page, setPage] = useState(0) // 0 = 표지

  // 일기는 하루 한 편이라 전부 읽어도 1년에 365개예요 (홈과 같은 방식)
  useEffect(() => {
    getDocs(collection(db, 'users', auth.currentUser.uid, 'diaries'))
      .then((snap) => setAll(snap.docs.map((d) => d.data()).filter((d) => !d.isDeleted && d.diaryDate)))
      .catch((e) => {
        console.error(e)
        setAll([])
      })
  }, [])

  const entries = useMemo(
    () =>
      (all ?? [])
        .filter((d) => d.diaryDate.startsWith(month))
        .sort((a, b) => a.diaryDate.localeCompare(b.diaryDate)),
    [all, month],
  )

  // 달을 바꾸면 표지부터 다시 봐요
  useEffect(() => setPage(0), [month])

  if (!all) return <main className="book" />

  const last = entries.length // 표지(0) 포함 마지막 쪽 번호
  const [year, mon] = month.split('-')

  return (
    <main className="book">
      <h1 className="book__heading">한달 그림책</h1>

      <div className="calendar__header">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달">
          <CaretLeft size={20} weight="bold" />
        </button>
        <input
          type="month"
          className="book__month"
          value={month}
          max={thisMonth()}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          aria-label="달 선택"
        />
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= thisMonth()}
          aria-label="다음 달"
        >
          <CaretRight size={20} weight="bold" />
        </button>
      </div>

      {page === 0 ? (
        <section className="book__page book__cover">
          <p className="book__cover-year">{year}</p>
          <h2 className="book__cover-title">{Number(mon)}월의 그림책</h2>
          <img src="/icon-192.png" alt="" />
          <p className="book__text">
            {entries.length ? `일기 ${entries.length}편이 담겼어요` : '이 달에는 아직 일기가 없어요'}
          </p>
        </section>
      ) : (
        <BookPage entry={entries[page - 1]} />
      )}

      <div className="book__pager">
        <button type="button" onClick={() => setPage(page - 1)} disabled={page === 0} aria-label="이전 쪽">
          <CaretLeft size={20} weight="bold" />
        </button>
        <span>{page + 1} / {last + 1}</span>
        <button type="button" onClick={() => setPage(page + 1)} disabled={page === last} aria-label="다음 쪽">
          <CaretRight size={20} weight="bold" />
        </button>
      </div>
    </main>
  )
}

export default Book
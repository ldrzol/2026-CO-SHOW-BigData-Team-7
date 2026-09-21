import { useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'

// TODO: Firebase 연동 후 선택한 달의 일기 목록 조회
// { id, date: '9월 5일 금요일', mood: '😊', title, content, image }
const ENTRIES = []

function BookPage({ entry }) {
  return (
    <section className="book__page">
      <div className="book__meta">
        <span>{entry?.date ?? '날짜'}</span>
        <span className="book__mood">{entry?.mood ?? '🙂'}</span>
      </div>
      <div className="book__picture">
        {entry?.image && <img src={entry.image} alt="" />}
      </div>
      <p className="book__title">{entry?.title ?? '일기 제목'}</p>
      <p className="book__text">{entry?.content ?? '이곳에 그날의 일기가 동화책처럼 담겨요.'}</p>
    </section>
  )
}

function Book() {
  const [viewDate, setViewDate] = useState(new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth() + 1
  const pages = ENTRIES.length ? ENTRIES : [null]

  function moveMonth(diff) {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + diff, 1))
  }

  return (
    <main className="book">
      <div className="calendar__header">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">
          <CaretLeft size={20} weight="bold" />
        </button>
        <h2 className="calendar__title">{year}년 {month}월</h2>
        <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">
          <CaretRight size={20} weight="bold" />
        </button>
      </div>

      <div className="book__pages">
        <section className="book__page book__cover">
          <p className="book__cover-year">{year}</p>
          <h2 className="book__cover-title">{month}월의 그림책</h2>
          <img src="/icon-192.png" alt="" />
        </section>
        {pages.map((entry, i) => (
          <BookPage key={entry?.id ?? i} entry={entry} />
        ))}
      </div>
    </main>
  )
}

export default Book

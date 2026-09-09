import { useState } from 'react'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getMonthGrid(year, month) {
  const startOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), outside: true })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), outside: false })
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), outside: true })
  }
  return cells
}

// entries: { '2026-09-05': '😊', ... }
// onDateClick: (dateKey) => void
function Calendar({ entries = {}, onDateClick }) {
  const [viewDate, setViewDate] = useState(new Date())
  const [selectedKey, setSelectedKey] = useState(null)
  const todayKey = toDateKey(new Date())
  const cells = getMonthGrid(viewDate.getFullYear(), viewDate.getMonth())
  const monthLabel = `${viewDate.getFullYear()}년 ${viewDate.getMonth() + 1}월`

  function goToPrevMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
  }

  function goToNextMonth() {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }

  function handleDateClick(key) {
    setSelectedKey(key)
    onDateClick?.(key)
  }

  return (
    <div className="calendar">
      <div className="calendar__header">
        <button type="button" onClick={goToPrevMonth} aria-label="이전 달">
          <CaretLeft size={20} weight="bold" />
        </button>
        <h2 className="calendar__title">{monthLabel}</h2>
        <button type="button" onClick={goToNextMonth} aria-label="다음 달">
          <CaretRight size={20} weight="bold" />
        </button>
      </div>
      <div className="calendar__grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar__weekday">{day[0]}</div>
        ))}
        {cells.map(({ date, outside }) => {
          const key = toDateKey(date)
          const isToday = key === todayKey
          const isSelected = key === selectedKey
          const emotion = entries[key]
          return (
            <div key={key} className="calendar__cell">
              <button
                type="button"
                onClick={() => handleDateClick(key)}
                className={[
                  'calendar__day',
                  emotion && 'has-entry',
                  isToday && 'is-today',
                  isSelected && 'is-selected',
                  outside && 'is-outside',
                ].filter(Boolean).join(' ')}
              >
                {emotion ?? date.getDate()}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Calendar
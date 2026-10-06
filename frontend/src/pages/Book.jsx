import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaretLeft, CaretRight, BookOpen } from '@phosphor-icons/react'
import { collection, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../lib/firebase.js'

// 디자인 원본(Monthly Diary 2a)의 기준 크기. 좁은 화면에서는 통째로 축소해요
const STAGE = 390
const LEAF_W = 186
const FLIP_MS = 720

const BLANK = { blank: true }

const monthOf = (key) => key.slice(0, 7)
const dayOf = (key) => Number(key.slice(8))
const daysInMonth = (month) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// 한 쪽 — 그림일기 한 장만 들어가요. 날짜도 기분도 그림 안에 이미 있어요
function DiaryPage({ entry }) {
  if (!entry || entry.blank) {
    return (
      <div className="dpage dpage--blank">
        <span>빈 페이지</span>
      </div>
    )
  }
  return (
    <div className="dpage">
      {entry.imageUrl ? (
        <img src={entry.imageUrl} alt={`${dayOf(entry.diaryDate)}일 그림일기`} className="dpage__pic" />
      ) : (
        <p className="dpage__nopic">그림은 아직 없어요</p>
      )}
    </div>
  )
}

// 속지를 제자리 크기로 줄여서 끼워 넣어요
const Leaf = ({ entry }) => (
  <div className="book__leaf-inner">
    <DiaryPage entry={entry} />
  </div>
)

export function BookView({ all }) {
  const [picked, setPicked] = useState(null) // null 이면 가장 최근 달
  const [spread, setSpread] = useState(0)
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState(null) // { dir, angle, anim }
  const [scale, setScale] = useState(1)
  const stage = useRef(null)
  const timer = useRef(null)
  const swipeX = useRef(null)

  // 좁거나 낮은 화면에서는 390px 무대를 통째로 줄여요.
  // 가로만 보면 작은 폰에서 아래가 잘려 스크롤이 생겨요
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const inner = el.firstElementChild
    const fit = () => {
      // 배율을 1 로 되돌려 원래 크기를 잰 뒤 "원래 값으로" 돌려놔요.
      // 지우기만 하면 배율이 그대로일 때 React 가 다시 그리지 않아 1 로 남아 화면 밖으로 삐져나와요
      const prevScale = inner.style.getPropertyValue('--book-scale')
      const prevTransform = inner.style.transform
      inner.style.setProperty('--book-scale', '1')
      inner.style.transform = 'none'
      const naturalH = inner.scrollHeight
      const naturalW = STAGE
      if (prevScale) inner.style.setProperty('--book-scale', prevScale)
      else inner.style.removeProperty('--book-scale')
      inner.style.transform = prevTransform

      // .book 의 min-height 는 calc() 가 px 로 계산돼 나와요. 보이는 영역의 높이예요
      const book = getComputedStyle(el.parentElement)
      const availH =
        parseFloat(book.minHeight) - parseFloat(book.paddingTop) - parseFloat(book.paddingBottom)
      const availW = el.getBoundingClientRect().width
      setScale(Math.min(1, availW / naturalW, naturalH > 0 && availH > 0 ? availH / naturalH : 1))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [all, open, picked])

  useEffect(() => () => clearTimeout(timer.current), [])

  // 일기가 있는 달만 표지로 세워요
  const months = useMemo(
    () => [...new Set((all ?? []).map((d) => monthOf(d.diaryDate)))].sort(),
    [all],
  )

  const entriesOf = useCallback(
    (month) =>
      (all ?? [])
        .filter((d) => monthOf(d.diaryDate) === month)
        .sort((a, b) => a.diaryDate.localeCompare(b.diaryDate)),
    [all],
  )

  // 고른 달이 없으면 가장 최근 달을 펴요
  const monthIndex = Math.min(picked ?? months.length - 1, months.length - 1)
  const month = months[monthIndex]
  const entries = useMemo(() => (month ? entriesOf(month) : []), [month, entriesOf])

  // 두 쪽 펼침이라 홀수면 빈 쪽을 한 장 붙여요
  const padded = entries.length % 2 ? [...entries, BLANK] : entries
  const spreads = Math.max(1, padded.length / 2)
  const at = (i) => padded[i] ?? BLANK

  function startFlip(dir) {
    if (flip) return
    setFlip({ dir, angle: 0, anim: false })
    // 두 프레임 뒤에 각도를 줘야 transition 이 걸려요
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setFlip({ dir, angle: dir === 'next' ? -180 : 180, anim: true })),
    )
    timer.current = setTimeout(() => {
      setSpread((s) => s + (dir === 'next' ? 1 : -1))
      setFlip(null)
    }, FLIP_MS)
  }

  function goNext() {
    if (flip) return
    if (spread < spreads - 1) startFlip('next')
    else if (monthIndex < months.length - 1) {
      setPicked(monthIndex + 1)
      setSpread(0)
    }
  }

  function goPrev() {
    if (flip) return
    if (spread > 0) startFlip('prev')
    else if (monthIndex > 0) {
      const n = entriesOf(months[monthIndex - 1]).length
      setPicked(monthIndex - 1)
      setSpread(Math.max(0, Math.ceil(n / 2) - 1))
    }
  }

  function toMonth(step) {
    const next = monthIndex + step
    if (flip || next < 0 || next >= months.length) return
    setPicked(next)
    setSpread(0)
  }

  function onPointerUp(e) {
    if (swipeX.current == null) return
    const dx = e.clientX - swipeX.current
    swipeX.current = null
    if (Math.abs(dx) > 36) (dx < 0 ? goNext : goPrev)()
  }

  if (!all) return <main className="book" />

  // 펼친 면과 넘어가는 장
  let left = at(2 * spread)
  let right = at(2 * spread + 1)
  let leaf = null
  if (flip?.dir === 'next') {
    right = at(2 * spread + 3)
    leaf = { front: at(2 * spread + 1), back: at(2 * spread + 2), x: LEAF_W, origin: 'left center' }
  } else if (flip?.dir === 'prev') {
    left = at(2 * spread - 2)
    leaf = { front: at(2 * spread), back: at(2 * spread - 1), x: 0, origin: 'right center' }
  }

  const shown = [left, right].filter((p) => !p.blank).map((p) => dayOf(p.diaryDate))
  const first = 2 * spread + 1
  const last = Math.min(2 * spread + 2, entries.length)

  const ticks = month
    ? Array.from({ length: daysInMonth(month) }, (_, i) => {
        const day = i + 1
        const index = entries.findIndex((e) => dayOf(e.diaryDate) === day)
        const on = shown.includes(day)
        return { day, index, on, has: index >= 0 }
      })
    : []

  if (!months.length) {
    return (
      <main className="book">
        <h1 className="book__heading">한달 그림책</h1>
        <p className="book__none">아직 일기가 없어요. 첫 장을 채워볼까요?</p>
      </main>
    )
  }

  return (
    <main className="book">
      <div className="book__stage" ref={stage}>
        <div className="book__scaled" style={{ transform: `scale(${scale})`, '--book-scale': scale, width: STAGE }}>
          {!open ? (
            <>
              <header className="book__shelf-head">
                <p className="book__month-big">{Number(month.slice(5, 7))}월</p>
                <p className="book__sub">{month.slice(0, 4)} · {entries.length}장</p>
              </header>

              <div className="book__shelf">
                {months.map((m, i) => {
                  const d = i - monthIndex
                  const away = Math.abs(d)
                  const off = d === 0 ? 0 : Math.sign(d) * (away === 1 ? 262 : 560)
                  return (
                    <button
                      type="button"
                      key={m}
                      className="book__cover"
                      aria-label={`${Number(m.slice(5, 7))}월 ${d === 0 ? '펼치기' : '보기'}`}
                      style={{
                        transform: `translateX(${off}px) scale(${d === 0 ? 1 : 0.86})`,
                        zIndex: 10 - away,
                      }}
                      onClick={() => (d === 0 ? (setOpen(true), setSpread(0)) : setPicked(i))}
                    >
                      <span className="book__spine" />
                    </button>
                  )
                })}
              </div>

              <p className="book__hint">옆 표지를 눌러 달 이동 · 가운데 표지를 눌러 펼치기</p>
              <div className="book__actions">
                <button type="button" className="book__open" onClick={() => (setOpen(true), setSpread(0))}>
                  <BookOpen size={20} weight="regular" /> 펼치기
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="book__back" onClick={() => !flip && setOpen(false)}>
                <CaretLeft size={22} weight="bold" /> 책장
              </button>

              <div className="book__month-nav">
                <button type="button" onClick={() => toMonth(-1)} disabled={monthIndex === 0} aria-label="이전 달">
                  <CaretLeft size={24} weight="bold" />
                </button>
                <span className="book__month-big">{Number(month.slice(5, 7))}월</span>
                <button
                  type="button"
                  onClick={() => toMonth(1)}
                  disabled={monthIndex === months.length - 1}
                  aria-label="다음 달"
                >
                  <CaretRight size={24} weight="bold" />
                </button>
              </div>
              <p className="book__sub">{month.slice(0, 4)} · {entries.length}장</p>

              <div className="book__board">
                <div
                  className="book__spread"
                  onPointerDown={(e) => { swipeX.current = e.clientX }}
                  onPointerUp={onPointerUp}
                >
                  <button type="button" className="book__half is-left" onClick={goPrev} aria-label="이전 쪽">
                    <Leaf entry={left} />
                    <span className="book__gutter is-left" />
                  </button>
                  <button type="button" className="book__half is-right" onClick={goNext} aria-label="다음 쪽">
                    <Leaf entry={right} />
                    <span className="book__gutter is-right" />
                  </button>

                  {leaf && (
                    <div
                      className="book__leaf"
                      style={{
                        left: leaf.x,
                        transformOrigin: leaf.origin,
                        transform: `rotateY(${flip.angle}deg)`,
                        transition: flip.anim ? 'transform .7s cubic-bezier(.45,.05,.3,1)' : 'none',
                      }}
                    >
                      <div className="book__face">
                        <Leaf entry={leaf.front} />
                      </div>
                      <div className="book__face is-back">
                        <Leaf entry={leaf.back} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="book__pages">
                {first === last ? first : `${first}–${last}`}쪽 / {entries.length} · 쪽을 눌러 넘기기
              </p>

              <div className="book__ticks">
                <div className="book__tick-row">
                  {ticks.map((t) => (
                    <button
                      type="button"
                      key={t.day}
                      className="book__tick"
                      disabled={!t.has}
                      aria-label={`${t.day}일`}
                      onClick={() => !flip && t.has && setSpread(Math.floor(t.index / 2))}
                    >
                      <span className={t.on ? 'is-on' : t.has ? 'is-has' : ''} />
                    </button>
                  ))}
                </div>
                <div className="book__tick-labels">
                  <span>1일</span>
                  <span>{daysInMonth(month)}일</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

// 일기는 하루 한 편이라 전부 읽어도 1년에 365개예요 (홈과 같은 방식)
function Book() {
  const [all, setAll] = useState(null) // null: 불러오는 중

  // onSnapshot 이라 저장된 사본이 먼저 떠서 두 번째 방문부터는 기다림이 없어요
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users', auth.currentUser.uid, 'diaries'),
        (snap) => setAll(snap.docs.map((d) => d.data()).filter((d) => !d.isDeleted && d.diaryDate)),
        (e) => {
          console.error(e)
          setAll([])
        },
      ),
    [],
  )

  return <BookView all={all} />
}

export default Book

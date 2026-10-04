import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import BackHeader from '../components/BackHeader.jsx'
import { auth, db } from '../lib/firebase.js'
import { fmt1, inPeriod, periodLabel, periodRange, recordStatus, todayKey } from '../lib/report.js'
import { monthComparison, periodSummary, repeatedSituations } from '../lib/aiReport.js'

function AnalyzeReport() {
  const [params] = useSearchParams()
  const kind = params.get('kind') === 'week' ? 'week' : 'month'
  const anchor = params.get('anchor') ?? todayKey()
  const range = useMemo(() => periodRange(kind, anchor), [kind, anchor])

  const [diaries, setDiaries] = useState(null) // null: 불러오는 중
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(null)

  // 월간 비교가 전월까지 보고, 연속 기록은 기간 밖까지 봐서 전체를 읽어요
  // 사건 조회가 실패해도 일기 쪽 카드는 살아 있어야 해서 따로 받아요
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    getDocs(collection(db, 'users', uid, 'diaries'))
      .then((snap) => setDiaries(snap.docs.map((d) => d.data()).filter((d) => !d.isDeleted)))
      .catch((e) => {
        console.error(e)
        setDiaries([])
      })
    getDocs(collection(db, 'users', uid, 'events'))
      .then((snap) => setEvents(snap.docs.map((d) => d.data())))
      .catch((e) => {
        console.error(e)
        setEvents([])
      })
  }, [])

  const period = useMemo(() => inPeriod(diaries ?? [], range), [diaries, range])
  const periodEvents = useMemo(() => events.filter((e) => e.diaryDate >= range.start && e.diaryDate <= range.end), [events, range])
  const summary = useMemo(() => periodSummary(periodEvents, kind), [periodEvents, kind])
  const situations = useMemo(() => repeatedSituations(periodEvents), [periodEvents])
  const month = useMemo(() => (kind === 'month' ? monthComparison(diaries ?? [], events, anchor) : null), [kind, diaries, events, anchor])
  const status = useMemo(() => recordStatus(period, diaries ?? []), [period, diaries])

  useEffect(() => {
    if (!open) return
    const close = (e) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  if (diaries === null) return <main className="sub analyze"><BackHeader title="AI 리포트" /></main>

  if (period.length === 0) {
    return (
      <main className="sub analyze">
        <BackHeader title="AI 리포트" />
        <section className="analyze__card">
          <p className="analyze__empty">분석할 기록이 없어요</p>
        </section>
      </main>
    )
  }

  const delta = (now, before, unit) => {
    if (before === null || now === null) return '비교 자료 없음'
    const diff = Math.round((now - before) * 10) / 10
    return `${diff > 0 ? '▲' : diff < 0 ? '▼' : '-'} ${Math.abs(diff)}${unit}`
  }

  return (
    <main className="sub analyze">
      <BackHeader title="AI 리포트" />

      {/* A01 */}
      <section className="analyze__card">
        <div className="report__intro">
          <span aria-hidden="true">💌</span>
          <div>
            <small>{periodLabel(kind, anchor)}</small>
            <strong>기록에 담긴 나의 이야기</strong>
          </div>
        </div>
        <p className="report__summary">{summary.text}</p>
        <button type="button" className="report__line" onClick={() => setOpen({ title: '기쁨이 담긴 경험', events: summary.positive })}>
          <b>😊 기쁨이 담긴 경험</b>
          {summary.positive.length}건 · {summary.positiveTopics || '해당 주제 없음'} →
        </button>
        <button type="button" className="report__line is-negative" onClick={() => setOpen({ title: '무거운 감정이 담긴 경험', events: summary.negative })}>
          <b>😟 무거운 감정이 담긴 경험</b>
          {summary.negative.length}건 · {summary.negativeTopics || '해당 주제 없음'} →
        </button>

        <h3 className="report__sub">반복해서 나타난 상황</h3>
        {situations.length === 0 ? (
          <p className="analyze__empty">아직 반복된 상황을 찾지 못했어요.</p>
        ) : (
          situations.map((s) => (
            <button key={s.title} type="button" className="topic-row" onClick={() => setOpen({ title: s.title, events: s.events })}>
              <span aria-hidden="true">{s.icon}</span>
              <span className="topic-row__name">
                {s.title}
                <small>서로 다른 {s.days}일의 기록에 등장했어요</small>
              </span>
              <b>›</b>
            </button>
          ))
        )}
      </section>

      {/* A02 — 월간만 */}
      {month && (
        <section className="analyze__card">
          <h2>월간 기록 변화 🌼</h2>
          {!month.hasPrev ? (
            <p className="analyze__empty">비교 자료 없음</p>
          ) : (
            <>
              <div className="analyze__tiles">
                <div className="analyze__tile">
                  <strong>{month.currCount}일</strong>
                  <span>작성 일수 · {delta(month.currCount, month.prevCount, '일')}</span>
                </div>
                <div className="analyze__tile">
                  <strong>{fmt1(month.currAvg)}</strong>
                  <span>평균 만족도 · {delta(month.currAvg, month.prevAvg, '점')}</span>
                </div>
              </div>
              {month.topicDiff.length > 0 && (
                <>
                  <h3 className="report__sub">기록 수가 달라진 주제</h3>
                  {month.topicDiff.map((t) => (
                    <p key={t.topic} className="report__diff">
                      {t.icon} {t.topic} <b>{t.diff > 0 ? `+${t.diff}` : t.diff}건</b>
                    </p>
                  ))}
                </>
              )}
              {month.recurring.length > 0 && (
                <>
                  <h3 className="report__sub">여러 주에 함께한 이야기</h3>
                  <div className="report__tags">
                    {month.recurring.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* 기록 한눈에 보기 */}
      <section className="analyze__card">
        <h2>기록 한눈에 보기</h2>
        <div className="analyze__tiles">
          <div className="analyze__tile">
            <strong>{status.count}개</strong>
            <span>작성한 일기</span>
          </div>
          <div className="analyze__tile">
            <strong>{status.topEmotions.join(' · ') || '자료 없음'}</strong>
            <span>최다 감정</span>
          </div>
          <div className="analyze__tile">
            <strong>{status.longestStreak}일</strong>
            <span>연속 기록</span>
          </div>
          <div className="analyze__tile">
            <strong>{fmt1(status.avgSatisfaction)}</strong>
            <span>평균 기분 점수</span>
          </div>
        </div>
      </section>

      {open && (
        <div className="evidence" role="dialog" aria-label={open.title} onClick={() => setOpen(null)}>
          <div className="evidence__panel" onClick={(e) => e.stopPropagation()}>
            <p className="evidence__head">
              <b>{open.title}</b>
              <button type="button" className="chart__tip-close" onClick={() => setOpen(null)} aria-label="닫기">✕</button>
            </p>
            {open.events.length === 0 ? (
              <p className="analyze__empty">해당하는 기록이 없어요.</p>
            ) : (
              <ul className="evidence__list">
                {open.events.map((e) => (
                  <li key={e.eventId}>
                    <small>{e.diaryDate}</small>
                    <p>{e.evidenceText}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export default AnalyzeReport
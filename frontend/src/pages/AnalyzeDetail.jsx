import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import BackHeader from '../components/BackHeader.jsx'
import { auth, db, functions } from '../lib/firebase.js'
import { EMOTIONS, NEGATIVE, inPeriod, periodLabel, periodRange, todayKey, wordCloud } from '../lib/report.js'
import { PIPELINE_VERSION, topicCounts, topicEmotionMatrix, topicEmotionRatio } from '../lib/aiReport.js'

function EvidenceDialog({ title, events, onClose }) {
  useEffect(() => {
    const close = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="evidence" role="dialog" aria-label={title} onClick={onClose}>
      <div className="evidence__panel" onClick={(e) => e.stopPropagation()}>
        <p className="evidence__head">
          <b>{title}</b>
          <button type="button" className="chart__tip-close" onClick={onClose} aria-label="닫기">✕</button>
        </p>
        {events.length === 0 ? (
          <p className="analyze__empty">해당하는 기록이 없어요.</p>
        ) : (
          <ul className="evidence__list">
            {events.map((e) => (
              <li key={e.eventId}>
                <small>{e.diaryDate}</small>
                <p>{e.evidenceText}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AnalyzeDetail() {
  const [params] = useSearchParams()
  const kind = params.get('kind') === 'week' ? 'week' : 'month'
  const anchor = params.get('anchor') ?? todayKey()
  const navigate = useNavigate()
  const range = useMemo(() => periodRange(kind, anchor), [kind, anchor])

  const [diaries, setDiaries] = useState(null) // null: 불러오는 중
  const [events, setEvents] = useState([])
  const [dialog, setDialog] = useState(null)
  const [word, setWord] = useState(null)
  const [running, setRunning] = useState(null) // null: 쉬는 중, 숫자: 분석 중인 일기 수

  const loadDiaries = useCallback(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return Promise.resolve()
    // 사건 조회가 실패해도 일기는 그대로 보여야 해서 따로 받아요
    return getDocs(collection(db, 'users', uid, 'diaries'))
      .then((snap) => setDiaries(snap.docs.map((d) => d.data()).filter((d) => !d.isDeleted)))
      .catch((e) => {
        console.error(e)
        setDiaries([])
      })
  }, [])

  useEffect(() => {
    loadDiaries()
  }, [loadDiaries])

  const loadEvents = useCallback(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return Promise.resolve()
    return getDocs(
      query(collection(db, 'users', uid, 'events'), where('diaryDate', '>=', range.start), where('diaryDate', '<=', range.end)),
    )
      .then((snap) => setEvents(snap.docs.map((d) => d.data())))
      .catch((e) => {
        console.error(e)
        setEvents([])
      })
  }, [range])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const period = useMemo(() => inPeriod(diaries ?? [], range), [diaries, range])

  // 분석이 아직 안 돈 일기 (0건으로 끝난 일기는 표시가 남아서 다시 안 돌아요)
  const pending = useMemo(
    () =>
      period.filter(
        (d) => d.analyzedContentVersion !== (d.contentVersion ?? 1) || d.analyzedPipeline !== PIPELINE_VERSION,
      ),
    [period],
  )

  // 상세 분석에 들어오면 밀린 일기를 알아서 한 편씩 돌려요
  useEffect(() => {
    if (diaries === null || pending.length === 0 || running !== null) return
    let cancelled = false
    setRunning(pending.length)
    ;(async () => {
      const call = httpsCallable(functions, 'analyzeDiary', { timeout: 300000 })
      // 한 편씩 기다리면 너무 오래 걸려서 같이 보내요
      await Promise.all(pending.map((d) => call({ diaryDate: d.diaryDate }).catch(console.error)))
      if (cancelled) return
      await Promise.all([loadDiaries(), loadEvents()])
      setRunning(null)
    })()
    return () => {
      cancelled = true
    }
  }, [diaries, pending, running, loadDiaries, loadEvents])
  const words = useMemo(() => wordCloud(period), [period])
  const topics = useMemo(() => topicCounts(events), [events])
  const happy = useMemo(() => topicEmotionRatio(events, ['기쁨']), [events])
  const hard = useMemo(() => topicEmotionRatio(events, NEGATIVE), [events])
  const matrix = useMemo(() => topicEmotionMatrix(events), [events])
  const topCount = Math.max(1, ...topics.map((t) => t.count))

  useEffect(() => {
    if (!word) return
    const close = (e) => e.key === 'Escape' && setWord(null)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [word])

  if (diaries === null) return <main className="sub analyze"><BackHeader title="상세 분석" /></main>

  if (period.length === 0) {
    return (
      <main className="sub analyze">
        <BackHeader title="상세 분석" />
        <section className="analyze__card">
          <p className="analyze__empty">분석할 기록이 없어요</p>
        </section>
      </main>
    )
  }

  return (
    <main className="sub analyze">
      <BackHeader title="상세 분석" />
      <p className="analyze__empty">{periodLabel(kind, anchor)}</p>

      {running !== null && (
        <section className="analyze__card">
          <p className="analyze__empty">
            일기 {running}편을 분석하고 있어요… 30초쯤 걸려요.
          </p>
        </section>
      )}

      {/* A04 */}
      <section className="analyze__card">
        <h2>많이 이야기한 주제</h2>
        {topics.length === 0 ? (
          <p className="analyze__empty">표시할 주제가 없어요.</p>
        ) : (
          topics.map((t) => (
            <button
              key={t.topic}
              type="button"
              className="topic-row"
              onClick={() => setDialog({ title: `${t.topic} 사건`, events: events.filter((e) => e.primaryTopic === t.topic) })}
            >
              <span aria-hidden="true">{t.icon}</span>
              <span className="topic-row__name">{t.topic}</span>
              <span className="topic-row__track">
                <i style={{ width: `${(t.count / topCount) * 100}%` }} />
              </span>
              <b>{t.count}건</b>
            </button>
          ))
        )}
      </section>

      {/* A05 */}
      <section className="analyze__card">
        <h2>무엇이 나를 웃게 했을까? 🙂</h2>
        {happy.length === 0 ? (
          <p className="analyze__empty">아직 기쁨이 담긴 주제를 찾지 못했어요.</p>
        ) : (
          happy.map((t) => (
            <button key={t.topic} type="button" className="topic-row" onClick={() => setDialog({ title: `${t.topic} · 기쁨`, events: t.events })}>
              <span aria-hidden="true">{t.icon}</span>
              <span className="topic-row__name">{t.topic}</span>
              <span className="topic-row__track">
                <i className="is-happy" style={{ width: `${t.percent}%` }} />
              </span>
              <b>{t.percent}%</b>
            </button>
          ))
        )}
        <p className="analyze__foot">• 해당 주제의 일기 중 긍정 감정 비율</p>
      </section>

      {/* A06 */}
      <section className="analyze__card">
        <h2>어떤 때 힘들었을까? 🙁</h2>
        {hard.length === 0 ? (
          <p className="analyze__empty">아직 부정 감정이 담긴 주제를 찾지 못했어요.</p>
        ) : (
          hard.map((t) => (
            <button key={t.topic} type="button" className="topic-row" onClick={() => setDialog({ title: `${t.topic} · 부정 감정`, events: t.events })}>
              <span aria-hidden="true">{t.icon}</span>
              <span className="topic-row__name">{t.topic}</span>
              <span className="topic-row__track">
                <i className="is-hard" style={{ width: `${t.percent}%` }} />
              </span>
              <b>{t.percent}%</b>
            </button>
          ))
        )}
        <p className="analyze__foot">• 해당 주제의 일기 중 부정 감정 비율</p>
      </section>

      {/* A07 */}
      <section className="analyze__card">
        <h2>연관 분석</h2>
        {matrix.length === 0 ? (
          <p className="analyze__empty">표시할 자료가 없어요.</p>
        ) : (
          <table className="matrix">
            <thead>
              <tr>
                <th aria-label="주제" />
                {EMOTIONS.map((e) => (
                  <th key={e.key}>{e.emoji}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.topic}>
                  <th scope="row">{row.topic}</th>
                  {row.cells.map((cell) => (
                    <td key={cell.key}>
                      <button
                        type="button"
                        disabled={cell.count === 0}
                        style={{ background: cell.count ? cell.color : 'transparent', opacity: cell.count ? 0.25 + (cell.percent / 100) * 0.75 : 1 }}
                        onClick={() => setDialog({ title: `${row.topic} · ${cell.label}`, events: cell.events })}
                      >
                        {cell.count ? `${cell.percent}%` : '—'}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* A03 */}
      <section className="analyze__card">
        <h2>키워드 워드클라우드</h2>
        {words.length === 0 ? (
          <p className="analyze__empty">표시할 단어가 없어요</p>
        ) : (
          <div className="cloud">
            {words.map((w, i) => (
              <button
                key={w.word}
                type="button"
                className={word?.word === w.word ? 'cloud__word is-active' : 'cloud__word'}
                style={{ fontSize: `${Math.max(13, 26 - i * 1.3)}px` }}
                onClick={() => setWord(word?.word === w.word ? null : w)}
              >
                {w.word}
              </button>
            ))}
          </div>
        )}
        {word && (
          <div className="cloud__detail">
            <p>
              <b>{word.word}</b> · {word.count}번 나왔어요
              <button type="button" className="chart__tip-close" onClick={() => setWord(null)} aria-label="닫기">✕</button>
            </p>
            <ul>
              {word.dates.map((date) => (
                <li key={date}>{date} · {period.find((d) => d.diaryDate === date)?.title || '제목 없음'}</li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" className="write__submit" onClick={() => navigate(`/analyze/report?kind=${kind}&anchor=${anchor}`)}>
        AI 리포트 보기
      </button>
      </section>

      {dialog && <EvidenceDialog {...dialog} onClose={() => setDialog(null)} />}
    </main>
  )
}

export default AnalyzeDetail
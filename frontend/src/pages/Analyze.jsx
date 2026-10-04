import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { collection, getDocs } from 'firebase/firestore'
import { auth, db } from '../lib/firebase.js'
import {
  axisSlots,
  careStreaks,
  emotionFlow,
  emotionRatio,
  fmt1,
  inPeriod,
  periodLabel,
  periodRange,
  recordStatus,
  satisfactionByEmotion,
  satisfactionFlow,
  shiftPeriod,
  todayKey,
} from '../lib/report.js'

const W = 320
const H = 150
const PX = 30
const PY = 20

function LineChart({ slots, lo, hi, ticks, tip }) {
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (open === null) return
    const close = (e) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  if (!slots.length) return <p className="analyze__empty">아직 기록이 없어요.</p>

  const x = (i) => (slots.length === 1 ? W / 2 : PX + (i * (W - PX * 2)) / (slots.length - 1))
  const y = (v) => H - PY - ((v - lo) / (hi - lo)) * (H - PY * 2)

  // 값이 없는 구간에서는 선을 끊어요
  const lines = []
  slots.forEach((s, i) => {
    const next = slots[i + 1]
    if (s.value !== null && next?.value != null) {
      lines.push({ key: s.label, x1: x(i), y1: y(s.value), x2: x(i + 1), y2: y(next.value) })
    }
  })

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        {ticks.map(({ value, label }) => (
          <g key={label}>
            <line x1={PX - 10} y1={y(value)} x2={W - PX + 10} y2={y(value)} className="chart__grid" />
            <text x={4} y={y(value) + 4} className="chart__axis">
              {label}
            </text>
          </g>
        ))}
        {lines.map((l) => (
          <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="chart__line" />
        ))}
        {slots.map((s, i) =>
          s.value === null ? null : (
            <g
              key={s.label}
              role="button"
              tabIndex={0}
              className="chart__point"
              aria-label={`${s.label} 기록 보기`}
              onClick={() => setOpen(open === i ? null : i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpen(open === i ? null : i)
                }
              }}
            >
              <circle cx={x(i)} cy={y(s.value)} r={12} fill="transparent" />
              <circle cx={x(i)} cy={y(s.value)} r={open === i ? 6 : 4} className="chart__dot" />
            </g>
          ),
        )}
        {slots.map((s, i) => (
          <text key={s.label} x={x(i)} y={H - 2} textAnchor="middle" className="chart__axis">
            {s.label}
          </text>
        ))}
      </svg>
      {open !== null && (
        <p className="chart__tip">
          {tip(slots[open])}
          <button type="button" className="chart__tip-close" onClick={() => setOpen(null)} aria-label="닫기">
            ✕
          </button>
        </p>
      )}
    </>
  )
}

function Donut({ rows, total }) {
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0

  return (
    <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="감정 비율">
      {total === 0 ? (
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--border)" strokeWidth="22" />
      ) : (
        rows
          .filter((r) => r.days)
          .map((r) => {
            const len = (r.days / total) * C
            const arc = (
              <circle
                key={r.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={r.color}
                strokeWidth="22"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            )
            offset += len
            return arc
          })
      )}
      <text x="70" y="68" textAnchor="middle" className="donut__value">
        {total === 0 ? '자료 없음' : `${total}일`}
      </text>
      {total > 0 && (
        <text x="70" y="86" textAnchor="middle" className="donut__cap">
          감정 기록
        </text>
      )}
    </svg>
  )
}

function Analyze() {
  const navigate = useNavigate()
  const [all, setAll] = useState(null) // null: 불러오는 중
  const [kind, setKind] = useState('month')
  const [anchor, setAnchor] = useState(todayKey())
  const [notice, setNotice] = useState(false)

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    // 역대 최장 연속·마음 돌봄이 기간 밖까지 봐야 해서 일기를 한 번에 다 읽어요
    getDocs(collection(db, 'users', uid, 'diaries'))
      .then((snap) => setAll(snap.docs.map((d) => d.data()).filter((d) => !d.isDeleted)))
      .catch((e) => {
        console.error(e)
        setAll([])
      })
  }, [])

  // 기간을 바꾸면 AI 안내는 닫아요
  useEffect(() => setNotice(false), [kind, anchor])

  const report = useMemo(() => {
    if (!all) return null
    const range = periodRange(kind, anchor)
    const period = inPeriod(all, range)
    const slots = axisSlots(kind, anchor, period)
    return {
      period,
      status: recordStatus(period, all),
      ratio: emotionRatio(period),
      emotion: emotionFlow(slots, period),
      satisfaction: satisfactionFlow(slots, period),
      byEmotion: satisfactionByEmotion(period),
      care: careStreaks(all, range),
    }
  }, [all, kind, anchor])

  if (!report) return <main className="analyze" />

  const { status, ratio, care } = report
  const emotionTicks =
    kind === 'week'
      ? [{ value: 1, label: '😊' }, { value: -1, label: '😟' }]
      : [{ value: 1, label: '😊' }, { value: 0, label: '😐' }, { value: -1, label: '😟' }]

  return (
    <main className="analyze">
      <h1>분석</h1>

      <div className="analyze__period">
        <button type="button" onClick={() => setAnchor(shiftPeriod(kind, anchor, -1))} aria-label="이전 기간">
          <CaretLeft size={18} weight="bold" />
        </button>
        <span>{periodLabel(kind, anchor)}</span>
        <button type="button" onClick={() => setAnchor(shiftPeriod(kind, anchor, 1))} aria-label="다음 기간">
          <CaretRight size={18} weight="bold" />
        </button>
      </div>

      <div className="analyze__tabs">
        {[{ key: 'week', label: '주간' }, { key: 'month', label: '월간' }].map((t) => (
          <button
            key={t.key}
            type="button"
            className={kind === t.key ? 'analyze__tab is-active' : 'analyze__tab'}
            onClick={() => setKind(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* B01 기록 현황 */}
      <section className="analyze__card">
        <h2>기록 현황</h2>
        <div className="analyze__tiles">
          <div className="analyze__tile">
            <strong>{status.count}</strong>
            <span>작성한 일기</span>
          </div>
          <div className="analyze__tile">
            <strong>{fmt1(status.avgSatisfaction)}</strong>
            <span>평균 하루 만족도</span>
          </div>
          <div className="analyze__tile">
            <strong>{status.topEmotions.length ? status.topEmotions.join(' · ') : '자료 없음'}</strong>
            <span>가장 많이 선택한 감정</span>
          </div>
          <div className="analyze__tile">
            <strong>{status.longestStreak}일</strong>
            <span>역대 최장 연속 기록</span>
          </div>
        </div>
      </section>

      {/* B02 감정 비율 */}
      <section className="analyze__card">
        <h2>이번 기간의 감정 비율</h2>
        <div className="analyze__donut-row">
          <Donut rows={ratio.rows} total={ratio.total} />
          <ul className="analyze__legend">
            {ratio.rows.map((r) => (
              <li key={r.key}>
                <i style={{ background: r.color }} />
                {r.emoji} {r.label}
                <b>{r.percent === null ? '—' : `${fmt1(r.percent)}%`}</b>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* B03 감정 변화 흐름 */}
      <section className="analyze__card">
        <h2>감정 변화 흐름</h2>
        <LineChart
          slots={report.emotion}
          lo={-1}
          hi={1}
          ticks={emotionTicks}
          tip={(s) => `${s.label} · ${s.diaries.map((d) => d.userEmotion).join(', ')}`}
        />
      </section>

      {/* B04 만족도 변화 흐름 */}
      <section className="analyze__card">
        <h2>만족도 변화 흐름</h2>
        <LineChart
          slots={report.satisfaction}
          lo={1}
          hi={5}
          ticks={[{ value: 5, label: '5' }, { value: 3, label: '3' }, { value: 1, label: '1' }]}
          tip={(s) => `${s.label} · ${fmt1(s.value)}점${kind === 'month' ? ' (구간 평균)' : ''}`}
        />
      </section>

      {/* B05 감정별 하루 만족도 */}
      <section className="analyze__card">
        <h2>감정별 하루 만족도</h2>
        <div className="analyze__bars">
          {report.byEmotion.map((e) => (
            <div key={e.key} className="analyze__bar">
              <strong>{fmt1(e.value)}</strong>
              <div className="analyze__bar-track">
                {e.value !== null && (
                  <div className="analyze__bar-fill" style={{ height: `${(e.value / 5) * 100}%`, background: e.color }} />
                )}
              </div>
              <span>
                {e.emoji}
                <br />
                {e.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* B06 마음 돌봄 — 조건 미충족이면 카드 자체를 숨겨요 */}
      {care.length > 0 && (
        <section className="analyze__card">
          <h2>마음 돌봄</h2>
          {care.map((r) => (
            <div key={r.start} className="analyze__care">
              <p>
                {r.start} ~ {r.end} · {r.emotion} 감정이 {r.days}일 이어졌어요
              </p>
            </div>
          ))}
          <button type="button" className="analyze__ghost" onClick={() => navigate('/analyze/care')}>
            감정 환기 방법 보기
          </button>
        </section>
      )}

      {/* B07 상세 분석 진입 */}
      <section className="analyze__card">
        <h2>상세 분석 보기</h2>
        {status.count === 0 ? (
          <p className="analyze__empty">분석할 기록이 없어요</p>
        ) : notice ? (
          <>
            <p className="analyze__notice">상세 분석은 1회 무료로 볼 수 있고, 이후에는 월간 구독이 필요해요.</p>
            <button
              type="button"
              className="write__submit"
              onClick={() => navigate(`/analyze/detail?kind=${kind}&anchor=${anchor}`)}
            >
              확인하고 보고서 보기
            </button>
          </>
        ) : (
          <button type="button" className="write__submit" onClick={() => setNotice(true)}>
            상세 분석 보기
          </button>
        )}
      </section>
    </main>
  )
}

export default Analyze
import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import EmotionIcon from './EmotionIcon.jsx'
import EvidenceDialog from './EvidenceDialog.jsx'
import AiReportContent from './AiReportContent.jsx'
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
  previousPeriod,
} from '../lib/report.js'

const EMPTY_DIARIES = []
const W = 320
const H = 180
const PX = 30
const PY = 36

function LineChart({ slots, lo, hi, ticks, tip, title, bottomGap = PY }) {
  const gradient = useId()
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (open === null) return
    const close = (e) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  if (!slots.length) return <p className="analyze__empty">아직 기록이 없어요.</p>

  const x = (i) => (slots.length === 1 ? W / 2 : PX + (i * (W - PX * 2)) / (slots.length - 1))
  const height = H + bottomGap - PY
  const y = (v) => height - bottomGap - ((v - lo) / (hi - lo)) * (H - PY * 2)

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
      <svg viewBox={`0 0 ${W} ${height}`} className="chart" role="group" aria-label={title}>
        <defs><linearGradient id={gradient} x1="0" y1={PY} x2="0" y2={H - PY} gradientUnits="userSpaceOnUse"><stop stopColor="#f6cc43" /><stop offset="1" stopColor="#b291d9" /></linearGradient></defs>
        {ticks.map(({ value, label, emotion }) => (
          <g key={label}>
            <line x1={PX - 10} y1={y(value)} x2={W - PX + 10} y2={y(value)} className="chart__grid" />
            {emotion ? <image href={emotion === '행복' ? '/emotions/joy.png' : '/emotions/negative.png'} x="0" y={y(value) - 12} width="24" height="24" aria-label={label} /> : <text x={5} y={y(value) + 4} className="chart__axis">{label}</text>}
          </g>
        ))}
        {lines.map((l) => (
          <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="chart__line" style={{ stroke: `url(#${gradient})` }} />
        ))}
        {slots.map((s, i) =>
          s.value === null ? null : (
            <g
              key={s.label}
              role="button"
              tabIndex={0}
              className="chart__point"
              aria-label={`${title} ${s.label} 기록 보기`}
              onClick={() => setOpen(open === i ? null : i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setOpen(open === i ? null : i)
                }
              }}
            >
              <circle cx={x(i)} cy={y(s.value)} r={12} fill="transparent" />
              <circle cx={x(i)} cy={y(s.value)} r={open === i ? 6 : 4} className="chart__dot" style={{ fill: `url(#${gradient})` }} />
            </g>
          ),
        )}
        {slots.map((s, i) => (
          <text key={s.label} x={x(i)} y={height - 2} textAnchor="middle" className="chart__axis">
            {s.label}
          </text>
        ))}
      </svg>
      {open !== null && slots[open] && (
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

function ReportView({ diaries, events, kind, anchor, onPeriodChange, ai, loadAi, error, reload }) {
  const [notice, setNotice] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [careOpen, setCareOpen] = useState(false)
  const [dialog, setDialog] = useState(null)
  const all = diaries ?? EMPTY_DIARIES
  const change = (nextKind, nextAnchor) => {
    setNotice(false)
    setAiOpen(false)
    setCareOpen(false)
    setDialog(null)
    onPeriodChange(nextKind, nextAnchor)
  }
  const openAi = () => {
    setNotice(false)
    setAiOpen(true)
    loadAi(periodRange(kind, anchor))
  }

  const report = useMemo(() => {
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

  const { status, ratio, care } = report
  const emotionTicks =
    kind === 'week'
      ? [{ value: 1, label: '행복', emotion: '행복' }, { value: -1, label: '부정 감정', emotion: '불안함' }]
      : [{ value: 1, label: '행복', emotion: '행복' }, { value: 0, label: '·' }, { value: -1, label: '부정 감정', emotion: '불안함' }]

  return (
    <main className="analyze">
      <h1>분석</h1>

      <div className="analyze__period">
        <button type="button" onClick={() => change(kind, shiftPeriod(kind, anchor, -1))} aria-label="이전 기간">
          <CaretLeft size={18} weight="bold" />
        </button>
        <span>{periodLabel(kind, anchor)}</span>
        <button type="button" onClick={() => change(kind, shiftPeriod(kind, anchor, 1))} aria-label="다음 기간">
          <CaretRight size={18} weight="bold" />
        </button>
      </div>

      <div className="analyze__tabs">
        {[{ key: 'week', label: '주간' }, { key: 'month', label: '월간' }].map((t) => (
          <button
            key={t.key}
            type="button"
            className={kind === t.key ? 'analyze__tab is-active' : 'analyze__tab'}
            aria-pressed={kind === t.key}
            onClick={() => { if (kind !== t.key) change(t.key, previousPeriod(t.key)) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="report-body">
      {error ? <section className="analyze__card" role="status"><p>기록을 불러오지 못했어요.</p><button className="analyze__ghost" onClick={reload}>다시 불러오기</button></section> : diaries === null ? <section className="analyze__card" role="status">기록을 불러오고 있어요…</section> : <>
      <div className="report-welcome"><span aria-hidden="true">🌼</span><p>{status.count ? '차곡차곡 쌓인 기록, 내 마음을 함께 살펴봐요.' : '이 기간에는 아직 기록이 없어요. 다른 기간도 살펴보세요.'}</p></div>
      {/* B01 기록 현황 */}
      <section className="analyze__card">
        <h2>기록 현황</h2>
        <div className="analyze__tiles">
          <div className="analyze__tile">
            <strong>{status.count}<small>개</small></strong>
            <span>작성한 일기</span>
          </div>
          <div className="analyze__tile">
            <strong>{fmt1(status.avgSatisfaction)}{status.avgSatisfaction !== null && <small>점</small>}</strong>
            <span>평균 하루 만족도</span>
          </div>
          <div className="analyze__tile">
            <strong className="report-top-emotions">{status.topEmotions.length ? status.topEmotions.map((label) => <span key={label}><EmotionIcon emotion={label} decorative />{label}</span>) : '자료 없음'}</strong>
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
                <EmotionIcon emotion={r.label} decorative /> <span>{r.label}</span><small>{r.days}일</small>
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
          key={`emotion-${kind}-${anchor}`}
          title="감정 변화 흐름"
          bottomGap={64}
          slots={report.emotion}
          lo={-1}
          hi={1}
          ticks={emotionTicks}
          tip={(s) => `${s.keys[0]}${kind === 'month' ? ` ~ ${s.keys.at(-1)}` : ''} · ${s.diaries.map((d) => d.userEmotion).join(', ') || '자료 없음'}`}
        />
      </section>

      {/* B04 만족도 변화 흐름 */}
      <section className="analyze__card">
        <h2>만족도 변화 흐름</h2>
        <LineChart
          key={`satisfaction-${kind}-${anchor}`}
          title="만족도 변화 흐름"
          slots={report.satisfaction}
          lo={1}
          hi={5}
          ticks={[{ value: 5, label: '5' }, { value: 3, label: '3' }, { value: 1, label: '1' }]}
          tip={(s) => `${s.keys[0]}${kind === 'month' ? ` ~ ${s.keys.at(-1)}` : ''} · ${fmt1(s.value)}점${kind === 'month' ? ' (구간 평균)' : ''}`}
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
                <EmotionIcon emotion={e.label} size={32} decorative />
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
          <h2>마음 돌봄 🌱</h2>
          <p className="report-care-intro">마음에 작은 쉼표를 선물해 볼까요?</p>
          {care.map((r) => (
            <div key={r.start} className="analyze__care">
              <EmotionIcon emotion={r.emotion} size={36} decorative /><div className="report-care-message">
                <strong>{r.emotion} 감정이 {r.days}일 이어졌어요</strong>
                <small><time dateTime={r.start}>{r.start.slice(5).replace('-', '/')}</time> ~ <time dateTime={r.end}>{r.end.slice(5).replace('-', '/')}</time></small>
              </div>
              <button className="report-text-button" onClick={() => setDialog({ title: `${r.emotion}이 이어진 기록`, diaries: inPeriod(all, r) })}>기록 보기 →</button>
            </div>
          ))}
          <button type="button" className="analyze__ghost" aria-expanded={careOpen} onClick={() => setCareOpen(!careOpen)}>
            감정 환기 방법 보기 {careOpen ? '−' : '+'}
          </button>
          {careOpen && <div className="report-care-options"><Link to={`/analyze/care?view=activity&emotion=${encodeURIComponent(care.at(-1).emotion)}&kind=${kind}&anchor=${anchor}`}>🌿 가볍게 해볼 활동 고르기 <span>›</span></Link><Link to={`/analyze/care?view=help&kind=${kind}&anchor=${anchor}`}>📖 전문가 정보 보기 <span>›</span></Link></div>}
        </section>
      )}

      <section className="analyze__card report-entry">
        <h2>AI 리포트 보기</h2>
        <p className="analyze__notice">일기에 담긴 이야기와 감정을 조금 더 살펴봐요.</p>
        {!status.count ? <p className="analyze__empty">분석할 기록이 없어요.</p> : aiOpen ?
          <button className="analyze__ghost" aria-expanded="true" aria-controls="ai-report-content" onClick={() => setAiOpen(false)}>AI 리포트 접기</button> : notice ?
          <div className="report-access"><p>AI 리포트는 1회 무료로 볼 수 있고, 이후에는 월간 구독이 필요해요.</p><button className="report-primary" onClick={openAi}>안내 확인하고 보고서 보기</button><button className="report-text-button" onClick={() => setNotice(false)}>닫기</button></div> :
          <button className="report-primary" aria-expanded="false" onClick={() => setNotice(true)}>AI 리포트 보기 <span>↗</span></button>}
      </section>
      {aiOpen && <AiReportContent key={`${kind}-${anchor}`} kind={kind} anchor={anchor} diaries={all} events={events} ai={ai} onRetry={() => loadAi(periodRange(kind, anchor))} />}
      </>}
      {dialog && <EvidenceDialog {...dialog} onClose={() => setDialog(null)} />}
      </div>
    </main>
  )
}

export default ReportView

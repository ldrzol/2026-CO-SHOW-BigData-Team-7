import { useMemo, useState } from 'react'
import { EMOTIONS, NEGATIVE, fmt1, inPeriod, periodLabel, periodRange } from '../lib/report.js'
import { monthComparison, periodSummary, repeatedSituations, topicCounts, topicEmotionMatrix, topicEmotionRatio } from '../lib/aiReport.js'
import { currentEvents } from '../lib/reportData.js'
import NounCloud from './NounCloud.jsx'
import EmotionIcon from './EmotionIcon.jsx'
import EvidenceDialog from './EvidenceDialog.jsx'

const delta = (now, before, unit) => {
  if (before === null || now === null) return '비교 자료 없음'
  const diff = Math.round((now - before) * 10) / 10
  return `${diff > 0 ? '+' : ''}${diff}${unit}`
}

export default function AiReportContent({ kind, anchor, diaries, events, ai, onRetry }) {
  const [dialog, setDialog] = useState(null)
  const data = useMemo(() => {
    const range = periodRange(kind, anchor)
    const period = inPeriod(diaries, range)
    const allEvents = currentEvents(events, diaries)
    const selected = allEvents.filter((e) => e.diaryDate >= range.start && e.diaryDate <= range.end)
    return {
      period, selected, summary: periodSummary(selected, kind),
      situations: repeatedSituations(selected), topics: topicCounts(selected),
      happy: topicEmotionRatio(selected, ['행복']), hard: topicEmotionRatio(selected, NEGATIVE),
      matrix: topicEmotionMatrix(selected), month: kind === 'month' ? monthComparison(diaries, allEvents, anchor) : null,
    }
  }, [kind, anchor, diaries, events])
  const { period, selected, summary, situations, topics, happy, hard, matrix, month } = data
  const topCount = Math.max(1, ...topics.map((t) => t.count))
  if (!period.length) return <section className="analyze__card"><p className="analyze__empty">분석할 기록이 없어요.</p></section>
  return <div id="ai-report-content" className="report-ai">
    <div className="report-section-label">AI 리포트 <span>{periodLabel(kind, anchor)}</span></div>
    {ai.state === 'loading' && <section className="analyze__card" role="status"><p>기록을 살펴보고 있어요…</p>{ai.total > 0 && <small>{ai.completed} / {ai.total}편</small>}</section>}
    {ai.state === 'error' && <section className="analyze__card" role="status"><p>일부 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p><button className="analyze__ghost" onClick={onRetry}>다시 불러오기</button></section>}
    <section className="analyze__card report-summary">
      <h2>기간 요약</h2>
      <div className="report__intro"><span aria-hidden="true">💌</span><div><small>{periodLabel(kind, anchor)}</small><strong>기록에 담긴 나의 이야기</strong></div></div>
      <p className="report__summary">{summary.text}</p>
      <div className="report__pair">
        <button className="report__line" onClick={() => setDialog({ title: '행복이 담긴 경험', events: summary.positive })}><b><EmotionIcon emotion="행복" decorative /> 행복이 담긴 경험</b><span>{summary.positive.length}건 · {summary.positiveTopics || '해당 주제 없음'} →</span></button>
        <button className="report__line is-negative" onClick={() => setDialog({ title: '무거운 감정이 담긴 경험', events: summary.negative })}><b><EmotionIcon emotion="불안함" decorative /> 무거운 감정이 담긴 경험</b><span>{summary.negative.length}건 · {summary.negativeTopics || '해당 주제 없음'} →</span></button>
      </div>
      <h3 className="report__sub">반복해서 나타난 상황</h3>
      {situations.length === 0 ? <p className="analyze__empty">아직 반복된 상황을 찾지 못했어요.</p> : situations.map((s) =>
        <button key={s.title} className="topic-row" onClick={() => setDialog({ title: s.title, events: s.events })}><span>{s.icon}</span><span className="topic-row__name">{s.title}<small>서로 다른 {s.days}일의 기록</small></span><b>›</b></button>)}
    </section>
    {month && <section className="analyze__card">
      <h2>월간 기록 변화 🌼</h2>
      <div className="analyze__tiles">
        <div className="analyze__tile"><span>작성 일수</span><strong>{month.hasPrev ? month.prevCount : '—'} → {month.currCount}일</strong><small>{month.hasPrev ? delta(month.currCount, month.prevCount, '일') : '비교 자료 없음'}</small></div>
        <div className="analyze__tile"><span>평균 하루 만족도</span><strong>{fmt1(month.prevAvg)} → {fmt1(month.currAvg)}점</strong><small>{month.hasPrev ? delta(month.currAvg, month.prevAvg, '점') : '비교 자료 없음'}</small></div>
      </div>
      {month.hasPrev && month.topicDiff.length > 0 && <><h3 className="report__sub">기록 수가 달라진 주제</h3>{month.topicDiff.map((t) => <p key={t.topic} className="report__diff">{t.icon} {t.topic}<b>{t.diff > 0 ? '+' : ''}{t.diff}건</b></p>)}</>}
      {month.recurring.length > 0 && <><h3 className="report__sub">여러 주에 함께한 이야기</h3><div className="report__tags">{month.recurring.map((t) => <span key={t}>{t}</span>)}</div></>}
    </section>}
    <section className="analyze__card">
      <h2>자주 나온 단어</h2>
      <NounCloud diaries={period} onSelect={(w) => setDialog({ title: `${w.word} · ${w.count}번 나왔어요`, diaries: period.filter((d) => w.dates.includes(d.diaryDate)) })} />
    </section>
    <section className="analyze__card">
      <h2>많이 이야기한 주제</h2>
      {!topics.length ? <p className="analyze__empty">표시할 주제가 없어요.</p> : topics.map((t) =>
        <button key={t.topic} className="topic-row" onClick={() => setDialog({ title: `${t.topic} 이야기`, events: selected.filter((e) => e.primaryTopic === t.topic && e.topicDecisionStatus === 'classified') })}>
          <span>{t.icon}</span><span className="topic-row__name">{t.topic}</span><span className="topic-row__track"><i style={{ width: `${t.count / topCount * 100}%` }} /></span><b>{t.count}건</b>
        </button>)}
    </section>
    {[{ rows: happy, title: '어떤 주제에 행복이 담겼을까?', label: '행복', type: 'is-happy' }, { rows: hard, title: '어떤 주제에 부정 감정이 담겼을까?', label: '부정 감정', type: 'is-hard' }].map(({ rows, title, label, type }) =>
      <section className="analyze__card" key={label}><h2>{title}</h2>{!rows.length ? <p className="analyze__empty">아직 해당하는 주제가 없어요.</p> : rows.map((t) =>
        <button key={t.topic} className="topic-row" onClick={() => setDialog({ title: `${t.topic} · ${label}`, events: t.events })}><span>{t.icon}</span><span className="topic-row__name">{t.topic}</span><span className="topic-row__track"><i className={type} style={{ width: `${t.percent}%` }} /></span><b>{t.percent}%</b><span>›</span></button>)}</section>)}
    <section className="analyze__card">
      <h2>주제와 감정 연관 분석</h2>
      {!matrix.length ? <p className="analyze__empty">표시할 자료가 없어요.</p> : <div className="matrix-wrap"><table className="matrix"><thead><tr><th scope="col">주제</th>{EMOTIONS.map((e) => <th scope="col" key={e.key}><EmotionIcon emotion={e.label} decorative /><span>{e.label}</span></th>)}</tr></thead>
        <tbody>{matrix.map((r) => <tr key={r.topic}><th scope="row">{r.topic}</th>{r.cells.map((c) => <td key={c.key}><button disabled={!c.count} aria-label={`${r.topic} · ${c.label} ${c.percent}% 기록 보기`} style={{ background: c.count ? `color-mix(in srgb, ${c.color} ${20 + c.percent * 0.65}%, white)` : 'transparent' }} onClick={() => setDialog({ title: `${r.topic} · ${c.label}`, events: c.events })}>{c.count ? `${c.percent}%` : '—'}</button></td>)}</tr>)}</tbody>
      </table></div>}
    </section>
    {dialog && <EvidenceDialog {...dialog} onClose={() => setDialog(null)} />}
  </div>
}

// 개발 서버 전용. Firebase를 import하지 않고 실제 보고서 컴포넌트를 가상 자료로 확인합니다.
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FONT_OPTIONS, fontStyle } from './fonts.js'
import './fonts.css'
import ReportView from '../src/components/ReportView.jsx'
import { addDays, previousPeriod, periodRange } from '../src/lib/report.js'

const month = previousPeriod('month')
const week = previousPeriod('week')
const range = periodRange('month', month)
const dates = [...new Set([0, 1, 2, 4, 8, 12, 15, 18, 21, 24].map((n) => addDays(month, n)).concat([0, 1, 2, 3, 4, 5, 6].map((n) => addDays(week, n)), [range.end]))].sort()
const labels = ['불안함', '불안함', '불안함', '행복', '피곤함', '슬픔', '화남', '행복']
const bodies = ['발표 준비를 하며 잠이 부족해서 조금 걱정됐다.', '발표 연습 때문에 잠을 못 자서 걱정됐다.', '발표 순서를 확인하며 걱정했다.', '친구와 고민을 나누고 산책하니 즐거웠다.', '밤늦게 업무를 마쳐 피곤했다.', '친구와 고민을 나누며 마음이 가라앉았다.', '일이 꼬여 화가 났다.', '공원에서 산책하고 음악을 들으니 즐거웠다.']
const diaries = dates.map((date, i) => ({ diaryDate: date, userEmotion: labels[i % 8], satisfaction: [2, 3, 2, 5, 2, 3, 1, 4][i % 8], title: `가상 일기 ${i + 1}`, body: bodies[i % 8], contentVersion: 1, analyzedContentVersion: 1, analyzedPipeline: 'v2' }))
const topics = ['업무', '업무', '업무', '관계', '업무', '관계', '일상', '여가']
const events = diaries.map((d, i) => ({ eventId: `demo-${i}`, diaryDate: d.diaryDate, evidenceText: d.body, sourceContentVersion: 1, primaryTopic: topics[i % 8], topicDecisionStatus: 'classified', emotionDecisionStatus: 'assigned', representativeEmotion: d.userEmotion }))

export function Preview() {
  const [params, setParams] = useSearchParams()
  const [scenario, setScenario] = useState('normal')
  const [ai, setAi] = useState({ state: 'ready' })
  const kind = params.get('kind') === 'week' ? 'week' : 'month'
  const anchor = params.get('anchor') || previousPeriod(kind)
  const font = FONT_OPTIONS.find((f) => f.key === params.get('font')) || FONT_OPTIONS[0]
  return <>
    <aside style={{ padding: '8px 20px', fontSize: 12, color: '#82714a', background: '#fff8de' }}>가상 데이터 미리보기 · 저장·AI 요청 없음 <label>상태 <select aria-label="미리보기 상태" value={scenario} onChange={(e) => setScenario(e.target.value)}><option value="normal">기록 있음</option><option value="empty">기록 없음</option><option value="loading">불러오는 중</option><option value="error">불러오기 실패</option></select></label></aside>
    <div className="font-preview-controls"><label>비교할 글꼴 <select aria-label="비교할 글꼴" value={font.key} onChange={(e) => setParams((prev) => { const next = new URLSearchParams(prev); next.set('font', e.target.value); return next })}>{FONT_OPTIONS.map((f) => <option key={f.key} value={f.key}>{f.letter}. {f.name}</option>)}</select></label><Link to="/fonts">4가지 글꼴 나란히 비교하기</Link></div>
    <div className="preview-font-scope" style={fontStyle(font)}><ReportView key={`${kind}-${anchor}-${scenario}`} diaries={scenario === 'loading' ? null : scenario === 'empty' ? [] : diaries} events={events} kind={kind} anchor={anchor} onPeriodChange={(k, a) => setParams({ kind: k, anchor: a, font: font.key })} ai={ai} loadAi={() => setAi({ state: 'ready' })} error={scenario === 'error'} reload={() => setScenario('normal')} /></div>
  </>
}

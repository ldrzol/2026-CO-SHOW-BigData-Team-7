import { EMOTIONS, NEGATIVE, inPeriod, periodRange, shiftPeriod } from './report.js'

// 추출·매칭 로직이 바뀌면 올려요. 이미 분석한 일기도 다시 돌아요 (backend/src/analyze.ts 와 같은 값)
export const PIPELINE_VERSION = 'v2'

export const TOPICS = ['업무', '관계', '여가', '휴식', '건강', '일상', '기타']
export const TOPIC_ICONS = { 업무: '💼', 관계: '🧑‍🤝‍🧑', 여가: '🎮', 휴식: '🛏️', 건강: '🏃', 일상: '🧺', 기타: '✨' }

const order = (a, b) => TOPICS.indexOf(a) - TOPICS.indexOf(b)

// 주제 집계는 주제가 확정된 사건 전부 — 감정이 보류돼도 주제는 세요
export const topicEvents = (events) => events.filter((e) => e.topicDecisionStatus === 'classified' && TOPICS.includes(e.primaryTopic))
// 감정 카드는 대표 감정이 실제 부여된 사건만
export const assignedEvents = (events) => events.filter((e) => e.emotionDecisionStatus === 'assigned' && EMOTIONS.some((m) => m.label === e.representativeEmotion))

/* A04 많이 이야기한 주제 */
export function topicCounts(events) {
  const base = topicEvents(events)
  return TOPICS.map((topic) => ({ topic, icon: TOPIC_ICONS[topic], count: base.filter((e) => e.primaryTopic === topic).length }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || order(a.topic, b.topic))
}

/* A05·A06 — 분자가 있는 주제만. 비율↓ → 분자 건수↓ → 고정 주제 순서 */
export function topicEmotionRatio(events, labels) {
  const base = topicEvents(assignedEvents(events))
  return TOPICS.map((topic) => {
    const rows = base.filter((e) => e.primaryTopic === topic)
    const hit = rows.filter((e) => labels.includes(e.representativeEmotion))
    return {
      topic,
      icon: TOPIC_ICONS[topic],
      count: hit.length,
      percent: rows.length ? Math.round((hit.length / rows.length) * 100) : 0,
      events: hit,
    }
  })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.percent - a.percent || b.count - a.count || order(a.topic, b.topic))
}

/* A07 주제 × 5감정 — 분모는 그 주제의 유효 대표 감정 사건 수 */
export function topicEmotionMatrix(events) {
  const base = topicEvents(assignedEvents(events))
  return TOPICS.map((topic) => {
    const rows = base.filter((e) => e.primaryTopic === topic)
    return {
      topic,
      icon: TOPIC_ICONS[topic],
      total: rows.length,
      cells: EMOTIONS.map((e) => {
        const hit = rows.filter((r) => r.representativeEmotion === e.label)
        return { ...e, count: hit.length, percent: rows.length ? Math.round((hit.length / rows.length) * 100) : 0, events: hit }
      }),
    }
  })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || order(a.topic, b.topic))
}

/* A01 기간 요약 — 긍정·부정 각각 빈도 상위 2개 주제와 부정 감정 상위 2개를 문장에 넣어요 */
export function periodSummary(events, kind) {
  const base = assignedEvents(events)
  const positive = base.filter((e) => e.representativeEmotion === '행복')
  const negative = base.filter((e) => NEGATIVE.includes(e.representativeEmotion))
  const topicText = (list) => topicCounts(list).slice(0, 2).map((r) => r.topic).join('·')
  const positiveTopics = topicText(positive)
  const negativeTopics = topicText(negative)
  const negativeNames = NEGATIVE.filter((label) => negative.some((e) => e.representativeEmotion === label))
    .map((label) => ({ label, count: negative.filter((e) => e.representativeEmotion === label).length }))
    .sort((a, b) => b.count - a.count || NEGATIVE.indexOf(a.label) - NEGATIVE.indexOf(b.label))
    .slice(0, 2)
    .map((x) => x.label)
    .join('·')

  const unit = kind === 'week' ? '주' : '달'
  const text = base.length
    ? `이번 ${unit} 일기에 기록한 사건에서 ` +
      (positiveTopics ? `${positiveTopics} 주제에는 행복이 관찰됐어요. ` : '행복이 기록된 사건은 없었어요. ') +
      (negativeTopics ? `${negativeTopics} 주제에는 ${negativeNames}이 관찰됐어요.` : '부정 감정이 기록된 사건은 없었어요.')
    : '이 기간에는 사건 감정 자료가 없어요.'

  return { text, positive, negative, positiveTopics, negativeTopics }
}

/* A01 안의 반복해서 나타난 상황 */
// ponytail: 전달본 시안의 문구 규칙 그대로예요. 의미 기반 묶기는 AI 요약을 붙일 때 교체
const SITUATION_RULES = [
  { title: '잠이 부족하거나 잠을 설친 날', icon: '🌙', match: (e) => /잠.*(부족|못|설쳤)/.test(e.evidenceText ?? '') },
  { title: '친구와 고민을 나눈 날', icon: '💬', match: (e) => (e.evidenceText ?? '').includes('친구') && (e.evidenceText ?? '').includes('고민') },
  { title: '밤늦게 할 일을 한 날', icon: '📝', match: (e) => e.primaryTopic === '업무' && (e.evidenceText ?? '').includes('밤늦게') },
]

export function repeatedSituations(events) {
  return SITUATION_RULES.map((rule) => {
    const matched = events.filter((e) => rule.match(e))
    // 같은 날 여러 건을 여러 날로 세지 않아요
    const days = new Set(matched.map((e) => e.diaryDate)).size
    return { title: rule.title, icon: rule.icon, days, events: matched }
  })
    .filter((item) => item.days >= 2)
    .sort((a, b) => b.days - a.days)
    .slice(0, 3)
}

/* A02 월간 기록 변화 — 월간에서만 씁니다 */
export function monthComparison(allDiaries, allEvents, anchor) {
  const curr = periodRange('month', anchor)
  const prev = periodRange('month', shiftPeriod('month', anchor, -1))
  const pick = (range) => inPeriod(allDiaries, range)
  const avg = (list) => {
    const scores = list.filter((d) => Number.isInteger(d.satisfaction) && d.satisfaction >= 1 && d.satisfaction <= 5).map((d) => d.satisfaction)
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  }
  const currDiaries = pick(curr)
  const prevDiaries = pick(prev)
  const evts = (range) => allEvents.filter((e) => e.diaryDate >= range.start && e.diaryDate <= range.end)

  const currCounts = topicCounts(evts(curr))
  const prevCounts = topicCounts(evts(prev))
  const countOf = (list, topic) => list.find((r) => r.topic === topic)?.count ?? 0
  const topicDiff = TOPICS.map((topic) => ({ topic, icon: TOPIC_ICONS[topic], diff: countOf(currCounts, topic) - countOf(prevCounts, topic) }))
    .filter((r) => r.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || order(a.topic, b.topic))
    .slice(0, 2)

  // 1~4주 중 2개 이상 구간에 나온 주제
  const weekOf = (date) => Math.min(3, Math.floor((Number(date.slice(8)) - 1) / 7))
  const recurring = TOPICS.filter((topic) => {
    const weeks = new Set(evts(curr).filter((e) => e.primaryTopic === topic).map((e) => weekOf(e.diaryDate)))
    return weeks.size >= 2
  })

  return {
    hasPrev: prevDiaries.length > 0,
    currCount: currDiaries.length,
    prevCount: prevDiaries.length,
    currAvg: avg(currDiaries),
    prevAvg: avg(prevDiaries),
    topicDiff,
    recurring,
  }
}
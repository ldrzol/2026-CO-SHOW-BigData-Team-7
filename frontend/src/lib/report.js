// 분석 계산 모음 — 분석페이지_기능명세.md 2절·5.1절 기준
// 날짜는 전부 'YYYY-MM-DD' 문자열, 달력은 Asia/Seoul

export const EMOTIONS = [
  { key: 'joy', label: '기쁨', emoji: '😊', color: '#ffd84d' },
  { key: 'calm', label: '평온함', emoji: '😌', color: '#b9e4dd' },
  { key: 'tired', label: '피곤함', emoji: '😪', color: '#a8dbab' },
  { key: 'sad', label: '슬픔', emoji: '😢', color: '#9ec9f0' },
  { key: 'angry', label: '화남', emoji: '😠', color: '#f49a9a' },
]

// 감정 이름 → 달력에 띄울 아이콘 경로 (public/emotions/*.png)
export const emotionIcon = (label) => {
  const found = EMOTIONS.find((e) => e.label === label)
  return found && `/emotions/${found.key}.png`
}

export const NEGATIVE = ['피곤함', '슬픔', '화남']
const LABELS = EMOTIONS.map((e) => e.label)

// 'sv-SE' 로케일이 YYYY-MM-DD 로 찍혀요
export const todayKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

// '2026-10-03' → '2026년 10월 3일 토요일'
export const dateLabel = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'UTC',
  })

// UTC 로 고정해서 기기 시간대·서머타임에 날짜가 밀리지 않게 해요
const toDate = (key) => new Date(`${key}T00:00:00Z`)
const toKey = (date) => date.toISOString().slice(0, 10)
export const addDays = (key, n) => toKey(new Date(toDate(key).getTime() + n * 86400000))
const mondayIndex = (key) => (toDate(key).getUTCDay() + 6) % 7 // 0=월 … 6=일

export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

export function periodRange(kind, anchor) {
  if (kind === 'week') {
    const start = addDays(anchor, -mondayIndex(anchor))
    return { start, end: addDays(start, 6) }
  }
  const d = toDate(anchor)
  return {
    start: `${anchor.slice(0, 7)}-01`,
    end: toKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))),
  }
}

export function shiftPeriod(kind, anchor, step) {
  if (kind === 'week') return addDays(anchor, step * 7)
  const d = toDate(anchor)
  return toKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1)))
}

export function periodLabel(kind, anchor) {
  if (kind === 'month') return `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`
  const { start, end } = periodRange(kind, anchor)
  return `${start.slice(5).replace('-', '.')} ~ ${end.slice(5).replace('-', '.')}`
}

// 소수 첫째 자리, 정수의 .0 은 생략
export const fmt1 = (n) => (n == null ? '—' : String(Math.round(n * 10) / 10))

const hasEmotion = (d) => LABELS.includes(d.userEmotion)
const hasSatisfaction = (d) => Number.isInteger(d.satisfaction) && d.satisfaction >= 1 && d.satisfaction <= 5
const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)

export const inPeriod = (diaries, { start, end }) =>
  diaries.filter((d) => d.diaryDate >= start && d.diaryDate <= end)

/* B01 기록 현황 — 연속 기록만 선택 기간 밖까지 봅니다 */
export function recordStatus(periodDiaries, allDiaries) {
  const counts = LABELS.map((label) => periodDiaries.filter((d) => d.userEmotion === label).length)
  const max = Math.max(0, ...counts)
  return {
    count: periodDiaries.length,
    avgSatisfaction: avg(periodDiaries.filter(hasSatisfaction).map((d) => d.satisfaction)),
    topEmotions: max === 0 ? [] : LABELS.filter((_, i) => counts[i] === max), // 동률이면 모두
    longestStreak: longestStreak(allDiaries.map((d) => d.diaryDate)),
  }
}

export function longestStreak(dateKeys) {
  const sorted = [...new Set(dateKeys)].sort()
  let best = 0
  let run = 0
  sorted.forEach((key, i) => {
    run = i > 0 && addDays(sorted[i - 1], 1) === key ? run + 1 : 1
    if (run > best) best = run
  })
  return best
}

/* B02 감정 비율 — 분모는 유효 감정 입력 일수 */
export function emotionRatio(periodDiaries) {
  const valid = periodDiaries.filter(hasEmotion)
  return {
    total: valid.length,
    rows: EMOTIONS.map((e) => {
      const days = valid.filter((d) => d.userEmotion === e.label).length
      return { ...e, days, percent: valid.length ? (days / valid.length) * 100 : null }
    }),
  }
}

/* B03·B04 공통 x축 — 주간은 일기를 작성한 요일만, 월간은 빈 구간도 남김 */
export function axisSlots(kind, anchor, periodDiaries) {
  const { start, end } = periodRange(kind, anchor)
  if (kind === 'week') {
    return WEEKDAY_LABELS.map((label, i) => ({ label, keys: [addDays(start, i)] })).filter((slot) =>
      periodDiaries.some((d) => d.diaryDate === slot.keys[0]),
    )
  }
  const lastDay = Number(end.slice(8))
  return [1, 8, 15, 22].map((from, i) => {
    const to = i === 3 ? lastDay : from + 6
    const keys = []
    for (let day = from; day <= to; day++) keys.push(`${anchor.slice(0, 7)}-${String(day).padStart(2, '0')}`)
    return { label: `${i + 1}주`, keys }
  })
}

/* B03 감정 흐름 — 긍정(기쁨·평온함) +1, 부정 세 감정 -1 의 평균 */
export function emotionFlow(slots, periodDiaries) {
  return slots.map((slot) => {
    const picked = periodDiaries.filter((d) => slot.keys.includes(d.diaryDate) && hasEmotion(d))
    return { ...slot, value: avg(picked.map((d) => (NEGATIVE.includes(d.userEmotion) ? -1 : 1))), diaries: picked }
  })
}

/* B04 만족도 흐름 */
export function satisfactionFlow(slots, periodDiaries) {
  return slots.map((slot) => {
    const picked = periodDiaries.filter((d) => slot.keys.includes(d.diaryDate) && hasSatisfaction(d))
    return { ...slot, value: avg(picked.map((d) => d.satisfaction)), diaries: picked }
  })
}

/* B05 감정별 하루 만족도 — 감정과 만족도가 둘 다 있는 일기만 */
export function satisfactionByEmotion(periodDiaries) {
  return EMOTIONS.map((e) => ({
    ...e,
    value: avg(
      periodDiaries.filter((d) => d.userEmotion === e.label && hasSatisfaction(d)).map((d) => d.satisfaction),
    ),
  }))
}

/* B06 마음 돌봄 — 전체 일기에서 구간을 찾고 선택 기간과 겹치면 표시(경계에서 자르지 않음) */
export function careStreaks(allDiaries, { start, end }) {
  const sorted = allDiaries.filter(hasEmotion).sort((a, b) => a.diaryDate.localeCompare(b.diaryDate))
  const runs = []
  for (const d of sorted) {
    const last = runs.at(-1)
    if (last && last.emotion === d.userEmotion && addDays(last.end, 1) === d.diaryDate) {
      last.end = d.diaryDate
      last.days += 1
    } else {
      runs.push({ emotion: d.userEmotion, start: d.diaryDate, end: d.diaryDate, days: 1 })
    }
  }
  return runs.filter((r) => NEGATIVE.includes(r.emotion) && r.days >= 3 && r.start <= end && r.end >= start)
}
/* A03 자주 나온 단어 — 출처는 사건이 아니라 선택 기간 일기 '본문'(제목 제외) */

const STOPWORDS = new Set([
  '그리고', '그래서', '하지만', '그런데', '오늘', '내일', '어제', '정말', '진짜', '너무', '조금',
  '그냥', '다시', '많이', '이런', '저런', '그런', '이렇게', '그렇게', '때문', '생각', '하루', '우리',
])

// 긴 조사부터 떼어내요
const PARTICLES = ['으로', '에서', '에게', '까지', '부터', '이랑', '하고', '보다', '처럼', '만큼', '이나', '라고',
  '는', '은', '이', '가', '을', '를', '에', '의', '도', '와', '과', '로', '만']

// ponytail: 형태소 분석기 없이 흔한 조사만 떼는 어림짐작이에요. 명사 추출기는 운영에서 교체
function trimParticle(word) {
  for (const p of PARTICLES) {
    if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length)
  }
  return word
}

export function wordCloud(periodDiaries, limit = 12) {
  const found = new Map()
  for (const d of periodDiaries) {
    for (const raw of String(d.body ?? '').split(/[^가-힣a-zA-Z0-9]+/)) {
      const word = trimParticle(raw)
      if (word.length < 2 || STOPWORDS.has(word)) continue
      const hit = found.get(word) ?? { word, count: 0, dates: [] }
      hit.count += 1
      if (!hit.dates.includes(d.diaryDate)) hit.dates.push(d.diaryDate)
      found.set(word, hit)
    }
  }
  // 빈도 내림차순, 동률은 한글 정렬
  return [...found.values()]
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'ko'))
    .slice(0, limit)
}
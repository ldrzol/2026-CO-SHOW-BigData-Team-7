import { normalizeEmotion } from './emotion.js'
// 분석 계산 모음 — 분석페이지_기능명세.md 2절·5.1절 기준
// 날짜는 전부 'YYYY-MM-DD' 문자열, 달력은 Asia/Seoul

export const EMOTIONS = [
  { key: 'joy', label: '행복', emoji: '😊', color: '#ffd84d' },
  { key: 'tired', label: '피곤함', emoji: '😪', color: '#b879c8' },
  { key: 'sad', label: '슬픔', emoji: '😢', color: '#7b78ce' },
  { key: 'angry', label: '화남', emoji: '😠', color: '#ee7484' },
  { key: 'anxious', label: '불안함', emoji: '😟', color: '#65a7f3' },
]

// 감정 이름 → 달력에 띄울 아이콘 경로 (public/emotions/*.png)
export const emotionIcon = (label) => {
  if (label === '평온함') return '/emotions/calm.png'
  const found = EMOTIONS.find((e) => e.label === normalizeEmotion(label))
  return found && `/emotions/${found.key}.png`
}

export const NEGATIVE = ['피곤함', '슬픔', '화남', '불안함']
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

const hasEmotion = (d) => LABELS.includes(normalizeEmotion(d.userEmotion))
const hasSatisfaction = (d) => Number.isInteger(d.satisfaction) && d.satisfaction >= 1 && d.satisfaction <= 5
const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)

export const inPeriod = (diaries, { start, end }) =>
  diaries.filter((d) => !d.isDeleted && d.diaryDate >= start && d.diaryDate <= end).map(normalizeDiary)

/* B01 기록 현황 — 연속 기록만 선택 기간 밖까지 봅니다 */
export function recordStatus(periodDiaries, allDiaries) {
  periodDiaries = periodDiaries.filter((d) => !d.isDeleted).map(normalizeDiary)
  allDiaries = allDiaries.filter((d) => !d.isDeleted)
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
  const valid = periodDiaries.filter((d) => !d.isDeleted && hasEmotion(d)).map(normalizeDiary)
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

/* B03 감정 흐름 — 행복 +1, 부정 네 감정 -1 의 평균 */
export function emotionFlow(slots, periodDiaries) {
  return slots.map((slot) => {
    const picked = periodDiaries.filter((d) => !d.isDeleted && slot.keys.includes(d.diaryDate) && hasEmotion(d)).map(normalizeDiary)
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
  periodDiaries = periodDiaries.filter((d) => !d.isDeleted).map(normalizeDiary)
  return EMOTIONS.map((e) => ({
    ...e,
    value: avg(
      periodDiaries.filter((d) => d.userEmotion === e.label && hasSatisfaction(d)).map((d) => d.satisfaction),
    ),
  }))
}

/* B06 마음 돌봄 — 전체 일기에서 구간을 찾고 선택 기간과 겹치면 표시(경계에서 자르지 않음) */
export function careStreaks(allDiaries, { start, end }) {
  const sorted = allDiaries.filter((d) => !d.isDeleted).map(normalizeDiary).sort((a, b) => a.diaryDate.localeCompare(b.diaryDate))
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
export const previousPeriod = (kind, today = todayKey()) => shiftPeriod(kind, periodRange(kind, today).start, -1)
export const normalizeDiary = (diary) => ({ ...diary, userEmotion: normalizeEmotion(diary.userEmotion) })

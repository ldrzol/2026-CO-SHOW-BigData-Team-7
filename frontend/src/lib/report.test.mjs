import assert from 'node:assert/strict'
import { axisSlots, careStreaks, emotionFlow, emotionRatio, longestStreak, periodRange, wordCloud } from './report.js'
import { assignEmotion, toApp5Scores } from './emotion.js'
import { topicCounts, topicEmotionMatrix, topicEmotionRatio } from './aiReport.js'

const d = (diaryDate, userEmotion, satisfaction) => ({ diaryDate, userEmotion, satisfaction })

/* ---- B01 연속 기록 ---- */

// 끊긴 구간을 넘어서 세지 않아요
assert.equal(longestStreak(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-05']), 3)
assert.equal(longestStreak([]), 0)

// 월 경계를 넘는 연속은 이어져요
assert.equal(longestStreak(['2026-07-31', '2026-08-01']), 2)

/* ---- B02 감정 비율 ---- */

// 분모는 유효 감정 입력 일수. 목록에 없는 감정은 빠져요
const ratio = emotionRatio([d('2026-08-01', '행복'), d('2026-08-02', '슬픔'), d('2026-08-03', '평온함')])
assert.equal(ratio.total, 2)
assert.equal(ratio.rows.find((r) => r.label === '행복').percent, 50)
assert.equal(emotionRatio([]).rows[0].percent, null)

/* ---- B03 감정 흐름 ---- */

// 주간 x축은 일기를 작성한 요일만 남아요 (2026-08-03 은 월요일)
const week = axisSlots('week', '2026-08-05', [d('2026-08-03', '행복'), d('2026-08-05', '슬픔')])
assert.deepEqual(week.map((s) => s.label), ['월', '수'])

// 긍정 +1, 부정 -1 의 평균. 빈 구간은 점이 없고 축은 1~4주로 남아요
const flow = emotionFlow(axisSlots('month', '2026-08-01', []), [d('2026-08-01', '행복'), d('2026-08-02', '슬픔')])
assert.equal(flow[0].value, 0)
assert.equal(flow[1].value, null)
assert.equal(flow.length, 4)

// 과거 평온함을 부정 감정으로 바꾸거나 현재 5감정 분모에 넣지 않아요
assert.equal(emotionFlow(axisSlots('month', '2026-08-01', []), [d('2026-08-01', '평온함')])[0].value, null)

/* ---- B06 마음 돌봄 ---- */

// 3일 이상 + 기간과 겹치면 경계 밖 날짜까지 그대로 표시해요
const care = careStreaks(
  [d('2026-07-30', '슬픔'), d('2026-07-31', '슬픔'), d('2026-08-01', '슬픔'), d('2026-08-02', '행복')],
  periodRange('month', '2026-08-01'),
)
assert.equal(care.length, 1)
assert.deepEqual([care[0].start, care[0].end, care[0].days], ['2026-07-30', '2026-08-01', 3])

// 2일짜리·긍정 감정은 안 잡혀요
assert.deepEqual(careStreaks([d('2026-08-01', '화남'), d('2026-08-02', '화남')], periodRange('month', '2026-08-01')), [])

/* ---- A03 워드클라우드 ---- */

// 조사를 떼고 세고, 빈도 내림차순 → 한글 정렬로 잘라요
const cloud = wordCloud(
  [
    { diaryDate: '2026-08-01', body: '친구와 떡볶이를 먹었다. 떡볶이는 맛있다.' },
    { diaryDate: '2026-08-02', body: '친구가 게임을 하자고 했다.' },
  ],
  3,
)
assert.deepEqual(cloud.map((w) => w.word), ['떡볶이', '친구', '게임'])
assert.equal(cloud[0].count, 2)
assert.deepEqual(cloud[1].dates, ['2026-08-01', '2026-08-02'])

// 한 글자·불용어는 빠져요
assert.deepEqual(wordCloud([{ diaryDate: '2026-08-01', body: '오늘 나 는 참 그냥' }]), [])

/* ---- KOTE 44 → 5 매핑과 감정 부여 ---- */

const p44 = Object.fromEntries(Array.from({ length: 44 }, (_, i) => [i, 0]))
p44[40] = 0.5
p44[28] = 0.9 // 즐거움/신남 → 행복
p44[27] = 0.2
p44[43] = 0.95 // 제외 라벨
p44[41] = 0.4 // 불안/걱정 → 불안함

// 연결된 라벨 점수의 최댓값을 써요
assert.equal(toApp5Scores(p44)['행복'], 0.9)
assert.equal(toApp5Scores(p44)['피곤함'], 0.2)
assert.equal(toApp5Scores(p44)['불안함'], 0.4)

// S1 >= 0.7 이고 차이 >= 0.2 일 때만 부여
const s = (행복, 불안함 = 0, 피곤함 = 0, 슬픔 = 0, 화남 = 0) => ({ 행복, 불안함, 피곤함, 슬픔, 화남 })
assert.equal(assignEmotion(s(0.9, 0, 0.2)).representativeEmotion, '행복')
assert.equal(assignEmotion(s(0.65, 0, 0.1)).emotionDecisionStatus, 'withheld')
assert.equal(assignEmotion(s(0.8, 0, 0.7)).emotionDecisionStatus, 'withheld')

// 1위 동점은 임의로 고르지 않고 보류해요
assert.equal(assignEmotion(s(0.9, 0.9)).representativeEmotion, null)

/* ---- A04~A07 사건 집계 ---- */

const ev = (eventId, primaryTopic, representativeEmotion) => ({
  eventId,
  diaryDate: '2026-08-01',
  evidenceText: '',
  primaryTopic,
  topicDecisionStatus: 'classified',
  emotionDecisionStatus: representativeEmotion ? 'assigned' : 'withheld',
  representativeEmotion,
})

const events = [
  ev('a', '업무', '행복'),
  ev('b', '업무', null), // 감정 보류
  ev('c', '관계', '화남'),
  ev('d', '관계', '행복'),
]

// 주제 집계는 감정이 보류된 사건도 세요
assert.deepEqual(topicCounts(events).map((r) => [r.topic, r.count]), [['업무', 2], ['관계', 2]])

// 감정 카드 분모는 감정이 부여된 사건만 — 업무는 2건 중 1건만 분모
assert.equal(topicEmotionRatio(events, ['행복']).find((r) => r.topic === '업무').percent, 100)
assert.equal(topicEmotionRatio(events, ['피곤함', '슬픔', '화남']).find((r) => r.topic === '관계').percent, 50)

// 주제 행은 유효 감정 사건 수 내림차순, 0건 주제는 빠져요
const matrix = topicEmotionMatrix(events)
assert.deepEqual(matrix.map((r) => r.topic), ['관계', '업무'])
assert.equal(matrix[0].cells.find((c) => c.label === '화남').percent, 50)

console.log('report.js / emotion.js / aiReport.js OK')

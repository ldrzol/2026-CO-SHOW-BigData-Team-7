import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APP5_MAPPING, assignEmotion, reportEvent, toApp5Scores } from './emotion.js'
import { EMOTIONS, careStreaks, inPeriod, periodRange, previousPeriod, recordStatus, satisfactionByEmotion, satisfactionFlow, axisSlots } from './report.js'
import { currentEvents, analyzePending } from './reportData.js'
import { monthComparison, periodSummary, topicEmotionMatrix } from './aiReport.js'

test('last completed week/month including Monday, Sunday, New Year and leap day', () => {
  assert.equal(previousPeriod('month', '2026-10-05'), '2026-09-01')
  assert.deepEqual(periodRange('week', previousPeriod('week', '2026-10-05')), { start: '2026-09-28', end: '2026-10-04' })
  assert.deepEqual(periodRange('week', previousPeriod('week', '2026-10-04')), { start: '2026-09-21', end: '2026-09-27' })
  assert.equal(previousPeriod('month', '2026-01-31'), '2025-12-01')
  assert.deepEqual(periodRange('week', previousPeriod('week', '2026-01-01')), { start: '2025-12-22', end: '2025-12-28' })
  assert.equal(periodRange('month', previousPeriod('month', '2024-03-31')).end, '2024-02-29')
})

test('official five emotions match both backend and source mapping; boundary assignment', () => {
  assert.deepEqual(EMOTIONS.map((e) => e.label), ['행복', '피곤함', '슬픔', '화남', '불안함'])
  const backend = readFileSync(new URL('../../../backend/src/analyze.ts', import.meta.url), 'utf8')
  for (const [label, ids] of Object.entries(APP5_MAPPING)) assert.ok(backend.includes(`${label}: [${ids.join(', ')}]`))
  const probabilities44 = Array(44).fill(0)
  probabilities44[14] = 0.99
  probabilities44[43] = 0.99
  probabilities44[41] = 0.9
  assert.equal(assignEmotion(toApp5Scores(probabilities44)).representativeEmotion, '불안함')
  assert.equal(assignEmotion({ 행복: 0.7, 피곤함: 0.5 }).representativeEmotion, '행복')
  assert.equal(assignEmotion({ 행복: 0.7, 피곤함: 0.500001 }).representativeEmotion, null)
  assert.equal(assignEmotion({ 행복: 0.8, 화남: 0.8 }).representativeEmotion, null)
  assert.equal(reportEvent({ probabilities44, representativeEmotion: '평온함' }).representativeEmotion, '불안함')
})

const diary = (diaryDate, userEmotion = '불안함', extra = {}) => ({ diaryDate, userEmotion, body: '일을 마치고 친구와 산책했다.', satisfaction: 3, contentVersion: 2, analyzedContentVersion: 2, analyzedPipeline: 'v2', ...extra })
test('care requires same emotion on consecutive calendar days; spans selected period boundary', () => {
  const range = periodRange('month', '2026-10-01')
  const list = [diary('2026-09-29'), diary('2026-09-30'), diary('2026-10-01')]
  assert.deepEqual(careStreaks(list, range), [{ emotion: '불안함', start: '2026-09-29', end: '2026-10-01', days: 3 }])
  assert.equal(careStreaks(list.map((d, i) => i === 1 ? { ...d, userEmotion: '화남' } : d), range).length, 0)
  assert.equal(careStreaks(list.map((d, i) => i === 1 ? { ...d, isDeleted: true } : d), range).length, 0)
  assert.equal(careStreaks(list.filter((_, i) => i !== 1), range).length, 0)
  assert.equal(careStreaks(list.map((d) => ({ ...d, userEmotion: '행복' })), range).length, 0)
})

test('null satisfaction stays missing; legacy joy reads as happiness; deleted diaries excluded', () => {
  const all = [diary('2026-09-01', '기쁨', { satisfaction: null }), diary('2026-09-02', '행복', { satisfaction: 0 }), diary('2026-09-03', '슬픔', { satisfaction: 5, isDeleted: true })]
  const rows = inPeriod(all, periodRange('month', '2026-09-01'))
  assert.equal(rows.length, 2)
  assert.equal(recordStatus(rows, all).avgSatisfaction, null)
  assert.deepEqual(recordStatus(rows, all).topEmotions, ['행복'])
  assert.ok(satisfactionByEmotion(rows).every((e) => e.value === null))
  assert.ok(satisfactionFlow(axisSlots('month', '2026-09-01', rows), rows).every((s) => s.value === null))
  assert.equal(monthComparison(rows, [], '2026-09-01').currAvg, null)
})

test('evidence excludes deleted, stale, unanalyzed and unmatched diary content', () => {
  const d = diary('2026-09-01')
  const event = { eventId: 'e1', diaryDate: d.diaryDate, sourceContentVersion: 2, evidenceText: '친구와 산책했다.', representativeEmotion: '기쁨', emotionDecisionStatus: 'assigned', primaryTopic: '관계', topicDecisionStatus: 'classified' }
  assert.equal(currentEvents([event], [d])[0].representativeEmotion, '행복')
  assert.deepEqual(currentEvents([event], [{ ...d, isDeleted: true }]), [])
  assert.deepEqual(currentEvents([event], [{ ...d, contentVersion: 3 }]), [])
  assert.deepEqual(currentEvents([event], [{ ...d, analyzedPipeline: 'v1' }]), [])
  assert.deepEqual(currentEvents([{ ...event, evidenceText: '없는 원문' }], [d]), [])
  const withUnknown = [event, { ...event, eventId: 'e2', representativeEmotion: '평온함' }].map(reportEvent)
  assert.equal(topicEmotionMatrix(withUnknown)[0].total, 1)
  assert.equal(periodSummary(withUnknown, 'week').positive.length, 1)
})

test('analysis is bounded, handles partial failure, and does not retry automatically', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => diary(`2026-09-0${i + 1}`, '행복', { analyzedContentVersion: 1 }))
  let concurrent = 0
  let maximum = 0
  const calls = []
  const result = await analyzePending(rows, async ({ diaryDate }) => {
    calls.push(diaryDate)
    maximum = Math.max(maximum, ++concurrent)
    await new Promise((resolve) => setTimeout(resolve, 2))
    concurrent--
    if (diaryDate === '2026-09-02') throw new Error('Synthetic failure')
  })
  assert.equal(maximum, 2)
  assert.equal(calls.length, 5)
  assert.deepEqual(result, { failed: 1, total: 5 })
  let cancelledCalls = 0
  await analyzePending(rows, async () => { cancelledCalls++ }, () => {}, () => false)
  assert.equal(cancelledCalls, 0)
  await analyzePending([diary('2026-09-01')], async () => assert.fail('Already analyzed diary called'))
})

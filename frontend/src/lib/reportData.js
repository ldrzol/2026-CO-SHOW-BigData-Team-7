import { PIPELINE_VERSION } from './aiReport.js'
import { reportEvent } from './emotion.js'

export const needsAnalysis = (diary) =>
  diary.analyzedContentVersion !== (diary.contentVersion ?? 1) || diary.analyzedPipeline !== PIPELINE_VERSION

// 삭제·수정된 일기의 과거 사건을 현재 보고서에 섞지 않아요.
export function currentEvents(events, diaries) {
  const byDate = new Map(diaries.filter((d) => !d.isDeleted).map((d) => [d.diaryDate, d]))
  return events.filter((event) => {
    const diary = byDate.get(event.diaryDate)
    return diary && !needsAnalysis(diary) && event.sourceContentVersion === (diary.contentVersion ?? 1)
      && typeof event.evidenceText === 'string' && event.evidenceText.length > 0
      && String(diary.body ?? '').includes(event.evidenceText)
  }).map(reportEvent)
}

// 실패한 항목을 자동 반복하지 않아요. 사용자가 재시도할 때만 다시 호출합니다.
export async function analyzePending(diaries, call, onProgress = () => {}, isActive = () => true) {
  const queue = diaries.filter(needsAnalysis)
  let index = 0
  let completed = 0
  let failed = 0
  async function worker() {
    while (index < queue.length && isActive()) {
      const diary = queue[index++]
      try { await call({ diaryDate: diary.diaryDate }) } catch { failed += 1 }
      completed += 1
      if (isActive()) onProgress({ completed, total: queue.length })
    }
  }
  await Promise.all([worker(), worker()])
  return { failed, total: queue.length }
}

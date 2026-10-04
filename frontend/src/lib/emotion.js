// KOTE 44 → 앱 5감정 — MAPPING_RULES_V0_3.json / REPORT_ASSIGNMENT_RULE_V0_1.json 기준
export const EMOTION_ORDER = ['행복', '피곤함', '슬픔', '화남', '불안함']

// 연결된 KOTE 라벨 ID. 10 안타까움/실망은 자동 점수에서 계속 제외해요
// 14 편안/쾌적, 43 안심/신뢰는 행복으로 흡수하지 않아요.
export const APP5_MAPPING = {
  행복: [13, 32, 40, 42, 28],
  피곤함: [27],
  슬픔: [5, 19, 36],
  화남: [0, 6, 22],
  불안함: [18, 41],
}

// 연결된 라벨 점수의 최댓값. 합계 100% 로 정규화하지 않고 확률로 읽지 않아요
export function toApp5Scores(probabilities44) {
  return Object.fromEntries(
    EMOTION_ORDER.map((e) => [e, Math.max(...APP5_MAPPING[e].map((id) => probabilities44[id] ?? 0))]),
  )
}

// S1 >= 0.7 이고 S1 - S2 >= 0.2 이며 1위 동점이 없을 때만 부여. 나머지는 '보류'(감정 없음이 아님)
export function assignEmotion(scores) {
  const sorted = EMOTION_ORDER.map((emotion) => ({ emotion, score: scores[emotion] ?? 0 })).sort(
    (a, b) => b.score - a.score,
  )
  const [s1, s2] = sorted
  const tied = sorted.filter((x) => x.score === s1.score).length > 1
  if (tied || s1.score < 0.7 || s1.score - s2.score < 0.2 - 1e-12) {
    return { emotionDecisionStatus: 'withheld', representativeEmotion: null }
  }
  return { emotionDecisionStatus: 'assigned', representativeEmotion: s1.emotion }
}
// 기존 표현만 호환하며 평온함을 다른 감정으로 바꾸지 않습니다.
export const normalizeEmotion = (label) => ['기쁨', '신남'].includes(label) ? '행복' : label

// 기존 문서는 보존하고, 저장된 44개 원점수를 현재 기준으로 다시 계산해 표시합니다.
export function reportEvent(event) {
  const raw = event.probabilities44
  const valid = raw && Array.from({ length: 44 }, (_, i) => raw[i]).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
  if (valid) return { ...event, ...assignEmotion(toApp5Scores(raw)) }
  const label = normalizeEmotion(event.representativeEmotion)
  return { ...event, representativeEmotion: EMOTION_ORDER.includes(label) ? label : null }
}

// KOTE 44 → 앱 5감정 — MAPPING_RULES_V0_3.json / REPORT_ASSIGNMENT_RULE_V0_1.json 기준
export const EMOTION_ORDER = ['기쁨', '평온함', '피곤함', '슬픔', '화남']

// 연결된 KOTE 라벨 ID. 10 안타까움/실망은 자동 점수에서 계속 제외해요
// 평온함(14 편안/쾌적, 43 안심/신뢰)은 전달본이 '행복이 흡수하지 않는다'고 비워둔 라벨을 씁니다
// 18 공포/무서움, 41 불안/걱정은 감정 5개를 이 목록으로 정하면서 어느 범주에도 들어가지 않아요
export const APP5_MAPPING = {
  기쁨: [13, 32, 40, 42, 28],
  평온함: [14, 43],
  피곤함: [27],
  슬픔: [5, 19, 36],
  화남: [0, 6, 22],
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
  if (tied || s1.score < 0.7 || s1.score - s2.score < 0.2) {
    return { emotionDecisionStatus: 'withheld', representativeEmotion: null }
  }
  return { emotionDecisionStatus: 'assigned', representativeEmotion: s1.emotion }
}
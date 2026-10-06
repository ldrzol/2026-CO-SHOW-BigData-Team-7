// 본문만 로컬에서 분석합니다. 일반명사/고유명사만 집계하고 제목은 제외합니다.
const STOPWORDS = new Set(['오늘', '어제', '내일', '하루', '때문', '생각'])

// 형태소 분석기가 명사로 잘못 붙이는 부사·감탄사들이에요
const NOT_NOUNS = new Set([
  '넘', '좀', '진짜', '그냥', '되게', '약간', '완전', '엄청', '너무', '아주', '정말', '제일', '가장',
  '다시', '아직', '벌써', '이제', '방금', '금방', '계속', '자꾸', '맨날', '항상', '가끔', '별로',
  '거', '것', '수', '때', '등', '중', '내', '네', '뭐', '왜', '좀더', '막', '안', '못', '잘', '더',
])

// 자음·모음만 있는 글자(ㅋ, ㅇ, ㅠ)와 숫자·기호를 걸러요. 완성된 한글만 남겨요
const HANGUL_ONLY = /^[가-힣]+$/

let analyzer
async function getAnalyzer() {
  analyzer ??= import('garu-ko').then(({ Garu }) => Garu.load()).catch((error) => {
    analyzer = null
    throw error
  })
  return analyzer
}

// 후보를 혼자 떼어 다시 분석해서, 쪼갰을 때도 전부 명사인 것만 통과시켜요.
// '사줬다'(사/VV+아/EC+주/VX…)나 '개맛있음'(개/NNB+맛있/VA…) 같은 건 여기서 걸러져요
function isRealNoun(garu, word, cache) {
  const hit = cache.get(word)
  if (hit !== undefined) return hit
  let ok = false
  try {
    const { tokens } = garu.analyze(word)
    ok = tokens.length > 0 && tokens.every((t) => t.pos === 'NNG' || t.pos === 'NNP')
  } catch {
    ok = false
  }
  cache.set(word, ok)
  return ok
}

export async function wordCloud(diaries, limit = 12) {
  if (!diaries.some((d) => String(d.body ?? '').trim())) return []
  const garu = await getAnalyzer()
  const found = new Map()
  const checked = new Map()
  for (const diary of diaries) {
    for (const word of garu.nouns(String(diary.body ?? ''))) {
      const clean = word.trim()
      if (!HANGUL_ONLY.test(clean)) continue
      if (STOPWORDS.has(clean) || NOT_NOUNS.has(clean)) continue
      if (!isRealNoun(garu, clean, checked)) continue
      const hit = found.get(clean) ?? { word: clean, count: 0, dates: [] }
      hit.count += 1
      if (!hit.dates.includes(diary.diaryDate)) hit.dates.push(diary.diaryDate)
      found.set(clean, hit)
    }
  }
  return [...found.values()]
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'ko'))
    .slice(0, limit)
}

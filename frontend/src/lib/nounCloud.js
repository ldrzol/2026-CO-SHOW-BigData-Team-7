// 본문만 로컬에서 분석합니다. 일반명사/고유명사만 집계하고 제목은 제외합니다.
const STOPWORDS = new Set(['오늘', '어제', '내일', '하루', '때문', '생각'])
let analyzer
async function getAnalyzer() {
  analyzer ??= import('garu-ko').then(({ Garu }) => Garu.load()).catch((error) => {
    analyzer = null
    throw error
  })
  return analyzer
}

export async function wordCloud(diaries, limit = 12) {
  if (!diaries.some((d) => String(d.body ?? '').trim())) return []
  const garu = await getAnalyzer()
  const found = new Map()
  for (const diary of diaries) {
    for (const word of garu.nouns(String(diary.body ?? ''))) {
      if (!word.trim() || STOPWORDS.has(word)) continue
      const hit = found.get(word) ?? { word, count: 0, dates: [] }
      hit.count += 1
      if (!hit.dates.includes(diary.diaryDate)) hit.dates.push(diary.diaryDate)
      found.set(word, hit)
    }
  }
  return [...found.values()]
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'ko'))
    .slice(0, limit)
}

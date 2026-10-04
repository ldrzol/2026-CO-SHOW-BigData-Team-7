import assert from 'node:assert/strict'
import test from 'node:test'
import { wordCloud } from './nounCloud.js'
import { cloudLayout } from './cloudLayout.js'

test('실제 형태소 분석: 명사만 추출하고 한 글자 명사도 유지', async () => {
  const words = await wordCloud([{ diaryDate: '2026-09-01', title: '제목전용단어', body: '잠을 잤다. 발표가 걱정됐다. 가족과 게임을 해서 즐거웠다. 친구와 병원에서 휴식을 취했다.' }])
  assert.deepEqual(words.map((w) => w.word).sort(), ['잠', '발표', '걱정', '가족', '게임', '친구', '병원', '휴식'].sort())
  assert.deepEqual(await wordCloud([{ body: '' }]), [])
})

test('빈도는 실제 등장 횟수, 근거 날짜는 중복 제거', async () => {
  const words = await wordCloud([
    { diaryDate: '2026-09-01', body: '발표를 했다. 발표가 끝났다.' },
    { diaryDate: '2026-09-02', body: '발표를 했다.' },
  ])
  assert.deepEqual(words.find((w) => w.word === '발표'), { word: '발표', count: 3, dates: ['2026-09-01', '2026-09-02'] })
})

test('같은 빈도·긴 명사 12개도 겹치거나 영역 밖으로 벗어나지 않음', () => {
  for (const entries of [
    ['발표', '가족', '게임', '친구', '잠', '병원', '휴식'],
    ['걱정', '고민', '발표', '산책', '친구', '업무', '부족', '순서', '공원', '마음', '음악', '일'],
    Array.from({ length: 12 }, (_, i) => `긴프로젝트단어${i}`),
  ]) {
    const input = entries.map((word, i) => ({ word, count: entries.length === 12 ? 3 : 9 - i }))
    const layout = cloudLayout(input)
    assert.equal(layout.words.length, entries.length)
    assert.equal(layout.height, 270, '공간이 부족해도 높이가 늘어나지 않아야 함')
    for (const [i, a] of layout.words.entries()) {
      assert.ok(a.x - a.width / 2 >= 0 && a.x + a.width / 2 <= layout.width)
      assert.ok(a.y - a.height / 2 >= 0 && a.y + a.height / 2 <= layout.height)
      for (const b of layout.words.slice(i + 1)) {
        assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.y - b.y) >= (a.height + b.height) / 2)
      }
    }
  }
})

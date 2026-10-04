const WIDTH = 360
const HEIGHT = 270
const overlaps = (a, b) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 8 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 8

// 정해진 타원 안에 모든 단어가 들어갈 때까지 전체 글자 크기를 함께 줄입니다.
// 공간 부족 시 아래로 행을 추가하지 않아 주간/월간 모두 구름 형태를 유지합니다.
export function cloudLayout(words) {
  const max = Math.max(1, ...words.map((w) => w.count))
  const boxes = words.map((word) => {
    const units = [...word.word].reduce((n, c) => n + (c.codePointAt(0) < 128 ? 0.72 : 1.05), 0)
    return { ...word, units, baseSize: Math.min(18 + 34 * Math.pow(word.count / max, 1.6), 290 / Math.max(1, units)) }
  })
  for (let scale = 1; ; scale *= 0.9) {
    const placed = []
    for (const word of boxes) {
      const size = word.baseSize * scale
      const box = { ...word, size, width: word.units * size + 4, height: size * 1.35 }
      let candidate
      for (let step = 0; step < 3000; step++) {
        const angle = step * 2.399963
        const radius = Math.sqrt(step / 3000)
        const next = { ...box, x: WIDTH / 2 + Math.cos(angle) * radius * 172, y: HEIGHT / 2 + Math.sin(angle) * radius * 127 }
        // 박스의 가장 먼 모서리까지 타원 안에 들어와야 합니다.
        const dx = (Math.abs(next.x - WIDTH / 2) + box.width / 2) / 172
        const dy = (Math.abs(next.y - HEIGHT / 2) + box.height / 2) / 127
        if (dx * dx + dy * dy > 1 || placed.some((other) => overlaps(next, other))) continue
        candidate = next
        break
      }
      if (!candidate) break
      placed.push(candidate)
    }
    if (placed.length === boxes.length) return { width: WIDTH, height: HEIGHT, words: placed }
  }
}

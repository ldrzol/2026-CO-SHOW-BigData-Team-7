const WIDTH = 360
const overlaps = (a, b) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 10 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 12

// 중앙의 큰 단어 주위로 배치합니다. 글자 폭을 보수적으로 잡아 겹침을 막습니다.
export function cloudLayout(words) {
  const placed = []
  let height = 250
  const max = Math.max(1, ...words.map((w) => w.count))
  for (const word of words) {
    const units = [...word.word].reduce((n, c) => n + (c.codePointAt(0) < 128 ? 0.72 : 1.05), 0)
    const size = Math.min(18 + 34 * Math.pow(word.count / max, 1.6), 290 / Math.max(1, units))
    const box = { ...word, size, width: units * size + 4, height: size * 1.35 }
    let candidate
    for (let step = 0; step < 2400; step++) {
      const angle = step * 0.31
      const radius = 2.5 * Math.sqrt(step)
      const next = { ...box, x: WIDTH / 2 + Math.cos(angle) * radius * 1.5, y: 122 + Math.sin(angle) * radius }
      if (next.x - box.width / 2 < 8 || next.x + box.width / 2 > WIDTH - 8 || next.y - box.height / 2 < 8 || next.y + box.height / 2 > height - 8) continue
      if (!placed.some((other) => overlaps(next, other))) { candidate = next; break }
    }
    if (!candidate) {
      candidate = { ...box, x: WIDTH / 2, y: height + box.height / 2 + 12 }
      height += box.height + 24
    }
    placed.push(candidate)
  }
  return { width: WIDTH, height, words: placed }
}

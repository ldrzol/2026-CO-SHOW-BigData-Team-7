// 캐릭터 파츠 PNG는 모두 1000x1000 같은 좌표로 그려져 있어서, 같은 박스에 겹쳐 그리기만 하면 맞춰져요
const numbered = (name, n) => Array.from({ length: n }, (_, i) => `${name}${i + 1}`)

const SKIN_COLORS = ['#ffe1d1', '#f9cfb2', '#e8b18a', '#c68b62', '#8d5a3b']
const HAIR_COLORS = ['#3b2a20', '#6b4226', '#a0692f', '#e2b453', '#222222', '#a8a8a8', '#e58fa6', '#7aa7e0']
const EYE_COLORS = ['#111111', '#5a3a22', '#2f5d9e', '#3f7d4a', '#8a4fb0']
const CLOTH_COLORS = ['#ffffff', '#ff8a80', '#ffd166', '#8ad18b', '#7fb8ff', '#b69cff', '#555555']

// view: 썸네일에서 보여줄 영역 [중심x, 중심y, 한 변] (1000x1000 기준)
export const TABS = [
  { key: 'skin', label: '피부', colorKey: 'skin', colors: SKIN_COLORS },
  { key: 'eye', label: '눈', files: numbered('eye', 4), colorKey: 'eyeColor', colors: EYE_COLORS, mode: 'ink', view: [502, 598, 420] },
  { key: 'eyebrow', label: '눈썹', files: numbered('eyebrow', 3), colorKey: 'hairColor', colors: HAIR_COLORS, mode: 'ink', view: [502, 478, 500] },
  { key: 'nose', label: '코', files: ['nose', 'nose2', 'nose3'], view: [502, 710, 160] },
  { key: 'mouth', label: '입', files: numbered('mouse', 6), view: [502, 815, 150] },
  { key: 'frontHair', label: '앞머리', files: numbered('fronthair', 7), colorKey: 'hairColor', colors: HAIR_COLORS, mode: 'fill', view: [502, 350, 860] },
  { key: 'backHair', label: '뒷머리', files: numbered('backhair', 6), colorKey: 'hairColor', colors: HAIR_COLORS, mode: 'fill', view: [500, 500, 1000] },
  { key: 'top', label: '상의', files: numbered('top', 4), colorKey: 'topColor', colors: CLOTH_COLORS, mode: 'fill', view: [502, 350, 800] },
  { key: 'bottom', label: '하의', colorKey: 'bottomColor', colors: CLOTH_COLORS },
  { key: 'shoes', label: '신발', colorKey: 'shoesColor', colors: CLOTH_COLORS },
]

export const DEFAULT_CHARACTER = {
  eye: 'eye1', eyebrow: 'eyebrow1', nose: 'nose', mouth: 'mouse1',
  frontHair: 'fronthair1', backHair: 'backhair1', top: 'top1',
  skin: SKIN_COLORS[0], eyeColor: EYE_COLORS[0], hairColor: HAIR_COLORS[1],
  topColor: CLOTH_COLORS[4], bottomColor: CLOTH_COLORS[6], shoesColor: CLOTH_COLORS[6],
}

const pick = (list) => list[Math.floor(Math.random() * list.length)]
export const randomCharacter = () =>
  Object.fromEntries(TABS.flatMap((t) => [t.files && [t.key, pick(t.files)], t.colors && [t.colorKey, pick(t.colors)]].filter(Boolean)))

// 400x400 캔버스 기준 머리·몸 위치
const HEAD = [111, 20, 178, 178]
const BODY = [95, 176, 210, 210]
// 가운데 두면 얼굴에 가려지는 뒷머리는 살짝 옮겨요 [x, y] (머리 크기 비율)
const BACK_HAIR_SHIFT = { backhair3: [0.26, 0], backhair6: [0, -0.11] }

// 그리는 순서 = 레이어 순서 (뒤 → 앞)
export function characterLayers(c) {
  const [dx, dy] = BACK_HAIR_SHIFT[c.backHair] ?? [0, 0]
  const head = (file, color, mode) => ({ file, box: HEAD, color, mode })
  const body = (file, color, mode) => ({ file, box: BODY, color, mode })
  return [
    { file: c.backHair, box: [HEAD[0] + dx * HEAD[2], HEAD[1] + dy * HEAD[3], HEAD[2], HEAD[3]], color: c.hairColor, mode: 'fill' },
    body('body', c.skin, 'skin'),
    body('bottom1', c.bottomColor, 'fill'),
    body(c.top, c.topColor, 'fill'),
    body('shoes1', c.shoesColor, 'fill'),
    head('face', c.skin, 'skin'),
    head(c.eye, c.eyeColor, 'ink'),
    head(c.nose),
    head(c.mouth),
    head(c.eyebrow, c.hairColor, 'ink'),
    head(c.frontHair, c.hairColor, 'fill'),
  ]
}

// 파츠 하나만 size x size 썸네일에 꽉 차게
export function thumbLayers(c, tab, file, size) {
  const [cx, cy, side] = tab.view
  const s = size / side
  return [{ file, box: [-(cx - side / 2) * s, -(cy - side / 2) * s, 1000 * s, 1000 * s], color: c[tab.colorKey], mode: tab.mode }]
}

// 프로필용 얼굴만: 몸 레이어는 빼고 머리 부분을 size x size 에 꽉 차게
const FACE_VIEW = [200, 112, 200] // 400x400 기준 [중심x, 중심y, 한 변]
export function faceLayers(c, size) {
  const [cx, cy, side] = FACE_VIEW
  const s = size / side
  return characterLayers(c)
    .filter((l) => l.box !== BODY)
    .map((l) => {
      const [x, y, w, h] = l.box
      return { ...l, box: [(x - (cx - side / 2)) * s, (y - (cy - side / 2)) * s, w * s, h * s] }
    })
}

const images = {}
export const loadImage = (file) =>
  (images[file] ??= new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `/characters/${file}.png`
  }))

// 원본 색: 회색 채움 141 / 회색 윤곽 68, 피부 #ffe1d1 / 갈색 윤곽, 눈·눈썹 검정
function tint(ctx, w, h, hex, mode) {
  const [R, G, B] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
    let k = 1 // ink: 검정 선을 통째로 선택한 색으로
    if (mode === 'skin') {
      if (r < 200) continue // 갈색 윤곽선은 그대로
      k = g / 225
    } else if (mode === 'fill') {
      if (Math.abs(r - b) > 10) continue // 회색이 아닌 부분은 그대로
      k = Math.min(r / 141, 1) // 채움은 선택한 색, 윤곽선은 같은 색의 어두운 버전
    }
    d[i] = R * k
    d[i + 1] = G * k
    d[i + 2] = B * k
  }
  ctx.putImageData(img, 0, 0)
}

export function paint(canvas, layers, imgs) {
  const ctx = canvas.getContext('2d')
  const tmp = document.createElement('canvas')
  tmp.width = canvas.width
  tmp.height = canvas.height
  const t = tmp.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  layers.forEach((layer, i) => {
    t.clearRect(0, 0, tmp.width, tmp.height)
    t.drawImage(imgs[i], ...layer.box)
    if (layer.color) tint(t, tmp.width, tmp.height, layer.color, layer.mode)
    ctx.drawImage(tmp, 0, 0)
  })
}
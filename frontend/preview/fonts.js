export const FONT_OPTIONS = [
  { key: 'mixed', letter: 'A', name: '주아체 제목 + 나눔고딕 본문', note: '선택한 글꼴 · 둥근 제목과 또렷한 본문', body: 'Nanum Gothic', heading: 'Jua', headingWeight: 400 },
  { key: 'gothic', letter: 'B', name: '나눔고딕', note: '차분하고 또렷한 느낌', body: 'Nanum Gothic', heading: 'Nanum Gothic', headingWeight: 700 },
  { key: 'gowun', letter: 'C', name: '고운돋움', note: '이전 글꼴 · 부드럽고 담백한 느낌', body: 'Gowun Dodum', heading: 'Gowun Dodum', headingWeight: 700 },
  { key: 'pen', letter: 'D', name: '나눔손글씨 펜', note: '손으로 쓴 일기 같은 느낌', body: 'Nanum Pen Script', heading: 'Nanum Pen Script', headingWeight: 400 },
]
export const fontStyle = (font) => ({ '--report-font': `'${font.body}'`, '--report-heading-font': `'${font.heading}'`, '--report-heading-weight': font.headingWeight })

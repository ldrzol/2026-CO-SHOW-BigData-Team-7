// 개발 서버 전용. Firebase 없이 가상 일기로 일기책 화면을 확인합니다.
import { BookView } from '../src/pages/Book.jsx'

const BODIES = [
  '비 오는 아침에 우산 쓰고 한 바퀴 돌았다. 웅덩이를 세 번 밟아서 양말이 다 젖었는데 그래도 기분은 좋았다.',
  '새 펜을 샀다. 잉크가 생각보다 진하게 나온다. 오늘은 이걸로 삐뚤삐뚤 써봐야지.',
  '회의만 네 개. 점심은 김밥 한 줄. 퇴근길에 본 노을이 너무 예뻤다.',
  '엄마랑 통화했다. 김치 보내준대. 다음 주엔 꼭 내려가기!',
  '아무것도 안 한 날. 이불 속에서 영화 두 편. 이런 날도 필요해.',
  '고양이가 키보드에 앉아서 메일이 반쯤 날아갔다. 범인은 너무 귀여움.',
  '첫 붕어빵! 팥 두 개에 슈크림 하나. 벌써 겨울 냄새가 난다.',
  '책 한 권 끝. 마지막 장에서 조금 울었다. 다음 책은 도서관에서 고르기.',
]
const TITLES = ['비 오는 날', '새 펜', '노을', '엄마 전화', '아무것도 안 한 날', '고양이', '붕어빵', '다 읽었다']
const EMOTIONS = ['행복', '피곤함', '슬픔', '화남', '불안함']

// 실제 그림일기와 같은 A4 비율(1024x1448)의 가짜 그림
const FAKE_PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1448"><rect width="1024" height="1448" fill="#ffffff"/><g fill="none" stroke="#282624" stroke-width="5"><rect x="48" y="48" width="928" height="84"/><rect x="48" y="148" width="928" height="84"/><rect x="48" y="252" width="928" height="636"/><rect x="48" y="912" width="928" height="80"/><rect x="48" y="1012" width="928" height="386"/></g><g stroke="#787570" stroke-width="3">${Array.from({ length: 11 }, (_, i) => `<line x1="${48 + (i + 1) * 77.3}" y1="1012" x2="${48 + (i + 1) * 77.3}" y2="1398"/>`).join('')}${Array.from({ length: 4 }, (_, i) => `<line x1="48" y1="${1012 + (i + 1) * 77.3}" x2="976" y2="${1012 + (i + 1) * 77.3}"/>`).join('')}</g><circle cx="512" cy="570" r="130" fill="#ffe068"/></svg>`,
  )

const month = (ym, days) =>
  days.map((day, i) => ({
    diaryDate: `${ym}-${String(day).padStart(2, '0')}`,
    title: TITLES[(day + i) % TITLES.length],
    body: BODIES[(day + i) % BODIES.length],
    userEmotion: EMOTIONS[(day + i) % EMOTIONS.length],
    // 그림이 아직 없는 날도 섞어서 빈 자리 모양까지 확인해요
    imageUrl: day % 5 === 0 ? '' : FAKE_PIC,
  }))

const diaries = [
  ...month('2026-07', [4, 8, 13, 19, 24, 30]),
  ...month('2026-08', [2, 5, 9, 12, 15, 18, 23, 28, 31]),
  ...month('2026-09', [1, 3, 6, 8, 11, 13, 14, 17, 20, 22, 25, 27, 30]),
  ...month('2026-10', [1, 3, 4, 5]),
]

export default function BookPreview() {
  return (
    <>
      <aside style={{ padding: '8px 20px', fontSize: 12, color: '#82714a', background: '#fff8de' }}>
        가상 데이터 미리보기 · 일기책 (그림은 비어 있어요)
      </aside>
      <BookView all={diaries} />
    </>
  )
}

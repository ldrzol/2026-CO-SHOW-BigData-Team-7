import { Link } from 'react-router-dom'
import { FONT_OPTIONS, fontStyle } from './fonts.js'
import './fonts.css'

export default function FontComparison() {
  return <main className="font-comparison">
    <header><Link to="/analyze">← 보고서로 돌아가기</Link><h1>보고서 글꼴, 어떤 느낌이 좋으세요?</h1><p>같은 글자 크기와 문구로 비교해 보세요. 마음에 드는 후보는 전체 보고서에서도 살펴볼 수 있어요.</p><small>후보 미리보기이며, 보고서의 기본 글꼴은 아직 바꾸지 않았어요.</small></header>
    <div className="font-comparison__grid">{FONT_OPTIONS.map((font) => <article key={font.key}>
      <div className="font-candidate-label"><b>{font.letter}. {font.name}</b><span>{font.note}</span></div>
      <div className="font-specimen preview-font-scope" style={fontStyle(font)}>
        <h2>기간 요약</h2>
        <strong>기록에 담긴 나의 이야기</strong>
        <p>이번 달 일기에 기록한 사건에서 관계·여가 주제에는 행복이 관찰됐어요. 마음에 작은 쉼표를 선물해 볼까요?</p>
        <div className="font-specimen__care"><img src="/emotions/anxious.png" width="30" height="30" alt="" /><div><strong>불안함 감정이 3일 이어졌어요</strong><small>09/01 ~ 09/03</small></div></div>
        <div className="font-specimen__numbers">작성한 일기 <b>13개</b> · 평균 만족도 <b>2.8점</b></div>
        <span className="font-specimen__button">AI 리포트 보기</span>
      </div>
      <Link className="font-candidate-open" to={`/analyze?font=${font.key}`}>{font.letter} 글꼴로 전체 보고서 보기</Link>
    </article>)}</div>
  </main>
}

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ACTIVITIES } from '../lib/care.js'
import { NEGATIVE } from '../lib/report.js'
import EmotionIcon from '../components/EmotionIcon.jsx'

const institutions = [
  { icon: '🏡', title: '지역 정신건강복지센터', body: '가까운 지역의 상담과 지원 서비스를 찾아보세요. 이용 대상과 방법은 해당 기관에서 확인할 수 있어요.', label: '우리 지역 기관 찾기', url: 'https://www.mentalhealth.go.kr/portal/health/fac/PotalHealthFacListTab2.do' },
  { icon: '💬', title: '청소년상담 1388', body: '학업, 진로, 친구 관계, 가족 문제 등 마음에 걸리는 고민을 나눌 수 있어요. 공식 홈페이지에서 상담 방법을 확인해보세요.', label: '1388 상담 방법 알아보기', url: 'https://www.1388.go.kr/' },
  { icon: '🌱', title: '국가정신건강정보포털', body: '마음건강 정보를 읽고, 도움을 받을 수 있는 기관을 알아보세요.', label: '도움을 주는 기관 알아보기', url: 'https://www.mentalhealth.go.kr/portal/health/fac/PotalHealthFacListTab1.do' },
]

export default function CareGuide() {
  const [params] = useSearchParams()
  const [emotion, setEmotion] = useState(NEGATIVE.includes(params.get('emotion')) ? params.get('emotion') : '피곤함')
  const [checked, setChecked] = useState([])
  const help = params.get('view') === 'help'
  const backParams = new URLSearchParams()
  for (const key of ['kind', 'anchor']) if (params.has(key)) backParams.set(key, params.get(key))
  const data = ACTIVITIES[emotion]
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return <main className="care-page report-body">
    <Link className="care-back" to={`/analyze?${backParams}`}>← 보고서로 돌아가기</Link>
    <header className="care-header">{help ? <span className="care-hero">📖</span> : <EmotionIcon emotion={emotion} size={80} />}
      <h1>{help ? '함께 이야기할 곳을 찾아요' : data.title}</h1><p>{help ? '마음이 버겁다면, 도움을 받을 곳이 있어요.' : '지금 편하게 할 수 있는 것 하나만 골라보세요.'}</p>
    </header>
    {help ? institutions.map((item) => <article className="analyze__card care-institution" key={item.title}><h2><span aria-hidden="true">{item.icon}</span> {item.title}</h2><p>{item.body}</p><a className="report-primary" href={item.url} target="_blank" rel="noopener noreferrer">{item.label} ↗</a></article>) : <>
      <div className="care-tabs" aria-label="돌보고 싶은 감정">{NEGATIVE.map((label) => <button key={label} aria-pressed={emotion === label} onClick={() => { setEmotion(label); setChecked([]) }}><EmotionIcon emotion={label} decorative />{label}</button>)}</div>
      {data.items.map(([icon, title, body], index) => <article key={`${emotion}-${title}`} className={`analyze__card care-activity${checked.includes(index) ? ' is-done' : ''}`}><span className="care-activity-icon" aria-hidden="true">{icon}</span><div><h2>{title}</h2><p>{body}</p><label><input type="checkbox" aria-label={`${title} 해봤어요`} checked={checked.includes(index)} onChange={(e) => setChecked(e.target.checked ? [...checked, index] : checked.filter((i) => i !== index))} />해봤어요</label></div></article>)}
      <p className="care-encourage" aria-live="polite">{checked.length ? '나를 위해 시간을 내줬네요. 수고했어요! 🌼' : '오늘은 한 가지만 해봐도 좋아요. 🌼'}</p>
      <details className="care-sources"><summary>활동 안내 참고</summary><p>일상에서 시도해볼 수 있는 자기 돌봄 활동입니다.</p><a href="https://www.nhs.uk/every-mind-matters/mental-health-issues/stress/" target="_blank" rel="noopener noreferrer">NHS · 스트레스와 자기 돌봄 ↗</a><a href="https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-fall-asleep-faster-and-sleep-better/" target="_blank" rel="noopener noreferrer">NHS · 수면 습관 ↗</a><a href="https://www.nhs.uk/every-mind-matters/mental-health-issues/low-mood/" target="_blank" rel="noopener noreferrer">NHS · 기분이 가라앉을 때 ↗</a><a href="https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/feelings-and-symptoms/anger/" target="_blank" rel="noopener noreferrer">NHS · 화가 날 때 ↗</a></details>
    </>}
  </main>
}

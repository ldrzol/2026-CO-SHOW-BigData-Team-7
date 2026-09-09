import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CaretLeft } from '@phosphor-icons/react'

const WEATHERS = [
  { key: 'sunny', label: '맑음', emoji: '☀️' },
  { key: 'cloudy', label: '흐림', emoji: '☁️' },
  { key: 'rainy', label: '비', emoji: '☔' },
  { key: 'snowy', label: '눈', emoji: '❄️' },
]

const MOODS = [
  { key: 'angry', label: '화남', emoji: '😠' },
  { key: 'sleepy', label: '졸림', emoji: '😪' },
  { key: 'lethargic', label: '무기력', emoji: '😑' },
  { key: 'excited', label: '신남', emoji: '🤩' },
  { key: 'sad', label: '슬픔', emoji: '😢' },
  { key: 'happy', label: '행복', emoji: '😊' },
  { key: 'anxious', label: '불안함', emoji: '😰' },
]

const today = new Date()
const dateLabel = today.toLocaleDateString('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

function Write() {
  const navigate = useNavigate()
  const [weather, setWeather] = useState('sunny')
  const [mood, setMood] = useState('happy')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  function handleSubmit() {
    // TODO: Firebase 연동 후 일기 저장 + 그림 일기 생성 요청
  }

  return (
    <main className="write">
      <header className="write__header">
        <button type="button" className="write__back" onClick={() => navigate(-1)} aria-label="뒤로가기">
          <CaretLeft size={20} />
        </button>
        <h1 className="write__title">일기 작성</h1>
      </header>

      <div className="write__card">
        <p className="write__date">{dateLabel}</p>

        <label className="write__label">날씨</label>
        <div className="write__weather">
          {WEATHERS.map(({ key, label, emoji }) => (
            <button
              key={key}
              type="button"
              className={weather === key ? 'write__chip is-active' : 'write__chip'}
              onClick={() => setWeather(key)}
            >
              <span>{emoji}</span> {label}
            </button>
          ))}
        </div>

        <label className="write__label">일기 제목</label>
        <input
          type="text"
          maxLength={20}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="오늘 하루의 제목을 적어주세요 (최대 20자)"
          className="write__input"
        />

        <label className="write__label">오늘 기분</label>
        <div className="write__moods">
          {MOODS.map(({ key, label, emoji }) => (
            <button
              key={key}
              type="button"
              className={mood === key ? 'write__mood is-active' : 'write__mood'}
              onClick={() => setMood(key)}
            >
              <span className="write__mood-emoji">{emoji}</span>
              {label}
            </button>
          ))}
        </div>

        <label className="write__label">일기 내용</label>
        <textarea
          maxLength={500}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="일기 내용을 텍스트로 작성해보세요... (최대 500자)"
          className="write__textarea"
        />
        <p className="write__count">{content.length} / 500자</p>
      </div>

      <button type="button" className="write__submit" onClick={handleSubmit}>
        그림 일기 만들기
      </button>
    </main>
  )
}

export default Write
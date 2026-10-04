import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CaretLeft } from '@phosphor-icons/react'
import { doc, increment, serverTimestamp, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../lib/firebase.js'
import { characterLayers, loadImage, paint } from '../lib/character.js'
import EmotionIcon from '../components/EmotionIcon.jsx'
import { EMOTIONS, todayKey } from '../lib/report.js'

const WEATHERS = [
  { label: '맑음', emoji: '☀️' },
  { label: '흐림', emoji: '☁️' },
  { label: '비', emoji: '☔' },
  { label: '눈', emoji: '❄️' },
  { label: '기타', emoji: '🌈' },
]

const VISIBILITIES = [
  { value: 'private', label: '나만 보기', emoji: '🔒' },
  { value: 'friends', label: '친구 공개', emoji: '👫' },
]

const SCORES = [1, 2, 3, 4, 5]

// 캐릭터 외형을 400x400 PNG(base64)로 떠서 Gemini 3번 참조 이미지로 보내요
async function characterPng(character) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 400
  const layers = characterLayers(character)
  paint(canvas, layers, await Promise.all(layers.map((l) => loadImage(l.file))))
  return canvas.toDataURL('image/png').split(',')[1]
}

function Write({ profile }) {
  const navigate = useNavigate()
  const [diaryDate, setDiaryDate] = useState(todayKey())
  const [weather, setWeather] = useState('맑음')
  const [emotion, setEmotion] = useState(EMOTIONS[0].label)
  const [intensity, setIntensity] = useState(3)
  const [satisfaction, setSatisfaction] = useState(3)
  const [visibility, setVisibility] = useState('private')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('') // '' | 'saving' | 'drawing'
  const [image, setImage] = useState('')
  const [comment, setComment] = useState('')

  const dateLabel = new Date(`${diaryDate}T00:00:00Z`).toLocaleDateString('ko-KR', {
    weekday: 'long',
    timeZone: 'UTC',
  })

  async function handleSubmit() {
    if (!content.trim() || status) return
    setStatus('saving')
    try {
      // 하루 한 편이라 문서 ID 가 날짜예요. 날짜는 만든 뒤 바꾸지 않아요
      // ponytail: contentHash 와 createdAt 은 DB 설계안대로 서버에서 채울 몫이라 여기선 비워둬요
      await setDoc(
        doc(db, 'users', auth.currentUser.uid, 'diaries', diaryDate),
        {
          diaryDate,
          weather,
          title,
          body: content,
          userEmotion: emotion,
          emotionIntensity: intensity,
          satisfaction,
          visibility,
          revision: increment(1),
          contentVersion: increment(1),
          isDeleted: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    } catch (e) {
      console.error(e)
      window.alert('일기를 저장하지 못했어요. 잠시 후 다시 시도해주세요.')
      setStatus('')
      return
    }

    // 분석은 그림과 따로 돌아요. 실패해도 일기 저장·그림은 그대로 진행해요
    httpsCallable(functions, 'analyzeDiary', { timeout: 300000 })({ diaryDate }).catch(console.error)

    setStatus('drawing')
    try {
      // 기본 70초로는 그림이 다 나오기 전에 끊겨요
      const gen = httpsCallable(functions, 'generateDiaryImage', { timeout: 300000 })
      const { data } = await gen({ diaryDate, character: await characterPng(profile.character) })
      setImage(data.imageUrl)
      setComment(data.aiComment || '')
    } catch (e) {
      console.error(e)
      window.alert(`일기는 저장했어요. ${e.message ?? '그림은 잠시 후 다시 만들어볼까요?'}`)
      navigate('/')
    }
    setStatus('')
  }

  if (image) {
    return (
      <main className="write">
        <header className="write__header">
          <h1 className="write__title">오늘의 그림일기</h1>
        </header>
        <img src={image} alt="오늘의 그림일기" className="write__result" />
        {comment && <p className="write__comment">{comment}</p>}
        <button type="button" className="write__submit" onClick={() => navigate('/')}>
          완료
        </button>
      </main>
    )
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
        <label className="write__label" htmlFor="write-date">날짜 · {dateLabel}</label>
        <input
          id="write-date"
          type="date"
          value={diaryDate}
          max={todayKey()}
          onChange={(e) => e.target.value && setDiaryDate(e.target.value)}
          className="write__input"
        />

        <label className="write__label">날씨</label>
        <div className="write__weather">
          {WEATHERS.map(({ label, emoji }) => (
            <button
              key={label}
              type="button"
              className={weather === label ? 'write__chip is-active' : 'write__chip'}
              onClick={() => setWeather(label)}
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
          {EMOTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={emotion === label ? 'write__mood is-active' : 'write__mood'}
              onClick={() => setEmotion(label)}
            >
              <EmotionIcon emotion={label} size={40} decorative />
              {label}
            </button>
          ))}
        </div>

        <label className="write__label">감정의 세기</label>
        <div className="write__scores">
          {SCORES.map((n) => (
            <button
              key={n}
              type="button"
              className={intensity === n ? 'write__score is-active' : 'write__score'}
              onClick={() => setIntensity(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <label className="write__label">오늘 하루 만족도</label>
        <div className="write__scores">
          {SCORES.map((n) => (
            <button
              key={n}
              type="button"
              className={satisfaction === n ? 'write__score is-active' : 'write__score'}
              onClick={() => setSatisfaction(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="write__count">1점 아쉬움 · 5점 만족</p>

        <label className="write__label">일기 내용</label>
        <textarea
          maxLength={1000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="일기 내용을 텍스트로 작성해보세요... (최대 1000자)"
          className="write__textarea"
        />
        <p className="write__count">{content.length} / 1000자</p>

        <label className="write__label">공개 범위</label>
        <div className="write__weather">
          {VISIBILITIES.map(({ value, label, emoji }) => (
            <button
              key={value}
              type="button"
              className={visibility === value ? 'write__chip is-active' : 'write__chip'}
              onClick={() => setVisibility(value)}
            >
              <span>{emoji}</span> {label}
            </button>
          ))}
        </div>
        <p className="write__count">친구 공개로 두면 친구 페이지 피드에 보여요</p>
      </div>

      <button type="button" className="write__submit" onClick={handleSubmit} disabled={!!status || !content.trim()}>
        {status === 'drawing' ? '그림 그리는 중… (30초쯤)' : status ? '저장 중…' : '그림 일기 만들기'}
      </button>
    </main>
  )
}

export default Write
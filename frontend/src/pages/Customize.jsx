import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, updateDoc } from 'firebase/firestore'
import { CaretLeft, Check, Shuffle } from '@phosphor-icons/react'
import { db } from '../lib/firebase.js'
import { DEFAULT_CHARACTER, TABS, randomCharacter } from '../lib/character.js'
import CharacterCanvas from '../components/CharacterCanvas.jsx'

// 가입 직후(캐릭터 없음)와 설정 > 커스터마이징 에서 같이 쓰는 화면
function Customize({ user, profile, onDone }) {
  const navigate = useNavigate()
  const isFirst = !profile.character
  const [character, setCharacter] = useState({ ...DEFAULT_CHARACTER, ...profile.character })
  const [tabKey, setTabKey] = useState('eye')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const tab = TABS.find((t) => t.key === tabKey)

  const set = (key, value) => setCharacter((c) => ({ ...c, [key]: value }))

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await updateDoc(doc(db, 'users', user.uid), { character })
      onDone({ ...profile, character })
      if (!isFirst) navigate('/setting')
    } catch (err) {
      console.error(err)
      setError('저장에 실패했어요. 잠시 후 다시 시도해주세요.')
      setSaving(false)
    }
  }

  return (
    <div className="custom">
      <div className="custom__stage">
        {!isFirst && (
          <button type="button" className="custom__icon-btn custom__back" onClick={() => navigate(-1)} aria-label="뒤로가기">
            <CaretLeft size={20} />
          </button>
        )}
        <button
          type="button"
          className="custom__icon-btn custom__shuffle"
          onClick={() => setCharacter(randomCharacter())}
          aria-label="랜덤으로 꾸미기"
        >
          <Shuffle size={20} weight="bold" />
        </button>
        <CharacterCanvas character={character} className="custom__preview" />
      </div>

      <div className="custom__panel">
        <div className="custom__tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tabKey}
              className={t.key === tabKey ? 'custom__tab is-active' : 'custom__tab'}
              onClick={() => setTabKey(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="custom__body">
          {tab.colors && (
            <div className="custom__colors">
              {tab.colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={character[tab.colorKey] === color ? 'custom__color is-active' : 'custom__color'}
                  style={{ '--swatch': color }}
                  onClick={() => set(tab.colorKey, color)}
                  aria-label={`색상 ${color}`}
                />
              ))}
            </div>
          )}

          {tab.files && (
            <div className="custom__grid">
              {tab.files.map((file) => (
                <button
                  key={file}
                  type="button"
                  className={character[tab.key] === file ? 'custom__item is-active' : 'custom__item'}
                  onClick={() => set(tab.key, file)}
                  aria-label={file}
                >
                  <CharacterCanvas character={character} tab={tab} file={file} className="custom__thumb" />
                  {character[tab.key] === file && (
                    <span className="custom__check">
                      <Check size={12} weight="bold" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="custom__footer">
          {error && <p className="setting__warning">{error}</p>}
          <button type="button" className="write__submit" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : isFirst ? '이대로 시작하기' : '저장하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Customize
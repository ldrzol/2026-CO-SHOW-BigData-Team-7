import { useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase.js'

// 첫 로그인 때 닉네임을 정하고 프로필을 저장하는 화면
function Nickname({ user, onDone }) {
  const [nickname, setNickname] = useState(user.displayName?.slice(0, 10) ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const profile = { nickname: nickname.trim(), email: user.email }
    try {
      await setDoc(doc(db, 'users', user.uid), { ...profile, createdAt: serverTimestamp() })
      onDone(profile)
    } catch (err) {
      console.error(err)
      setError('저장에 실패했어요. 잠시 후 다시 시도해주세요.')
      setSaving(false)
    }
  }

  return (
    <form className="login" onSubmit={handleSubmit}>
      <h1>닉네임을 정해주세요</h1>
      <input
        type="text"
        className="write__input"
        maxLength={10}
        required
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="최대 10자"
      />
      <p className="write__count">{nickname.length} / 10자</p>
      <button type="submit" className="write__submit" disabled={saving || !nickname.trim()}>
        {saving ? '저장 중...' : '시작하기'}
      </button>
      {error && <p className="setting__warning">{error}</p>}
    </form>
  )
}

export default Nickname

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { doc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../lib/firebase.js'
import { disablePush, enablePush, isPushOn } from '../lib/push.js'
import { CaretRight, Crown, PencilSimple, SignOut, Trash } from '@phosphor-icons/react'
import CharacterCanvas from '../components/CharacterCanvas.jsx'

const PUSH_ERRORS = {
  denied: '알림이 차단되어 있어요. 브라우저 설정에서 알림을 허용해주세요.',
  unsupported: '이 기기에서는 알림을 쓸 수 없어요. 아이폰은 홈 화면에 앱을 추가한 뒤 사용할 수 있어요.',
}

const SUB_PAGES = ['backup', 'storage', 'notice', 'customize']

function Setting({ profile, onProfileChange }) {
  const navigate = useNavigate()
  const uid = auth.currentUser.uid
  const [notifyOn, setNotifyOn] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState(profile.nickname)
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    isPushOn(uid).then(setNotifyOn).catch(console.error)
  }, [uid])

  async function handleNotify(on) {
    setNotifyOn(on)
    try {
      await (on ? enablePush(uid) : disablePush(uid))
    } catch (e) {
      console.error(e)
      setNotifyOn(!on)
      window.alert(PUSH_ERRORS[e.message] ?? '알림 설정에 실패했어요. 잠시 후 다시 시도해주세요.')
    }
  }

  function startEdit() {
    setNickname(profile.nickname)
    setEditing(true)
  }

  async function handleNickname(e) {
    e.preventDefault()
    const next = nickname.trim()
    if (next === profile.nickname) return setEditing(false)
    setSaving(true)
    try {
      await updateDoc(doc(db, 'users', uid), { nickname: next })
      onProfileChange({ ...profile, nickname: next })
      setEditing(false)
    } catch (err) {
      console.error(err)
      window.alert('닉네임 저장에 실패했어요. 잠시 후 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  function handleSelect(key) {
    if (SUB_PAGES.includes(key)) return navigate(`/setting/${key}`)
  }

  function handleLogout() {
    signOut(auth) // 로그아웃되면 App이 로그인 화면으로 보내줘요
  }

  function handleSubscribe() {
    // TODO: 결제창으로 이동 → 결제 완료 시 프리미엄 활성화
  }
  
  // 되돌릴 수 없어서 닉네임을 직접 적게 해서 한 번 더 확인해요
  async function handleWithdraw() {
    if (leaving) return
    const typed = window.prompt(
      `정말 탈퇴하시겠어요?\n일기, 그림, 친구, 프로필이 모두 지워지고 되돌릴 수 없어요.\n\n계속하려면 닉네임 "${profile.nickname}" 을 그대로 적어주세요.`,
    )
    if (typed === null) return
    if (typed.trim() !== profile.nickname) {
      return window.alert('닉네임이 달라서 취소했어요.')
    }
    setLeaving(true)
    try {
      await httpsCallable(functions, 'deleteAccount', { timeout: 540000 })()
      window.alert('탈퇴가 완료됐어요. 그동안 고마웠어요.')
      await signOut(auth).catch(() => {}) // 계정이 이미 지워져 실패해도 괜찮아요
      window.location.replace('/login')
    } catch (e) {
      console.error(e)
      setLeaving(false)
      window.alert('탈퇴에 실패했어요. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <main className="setting">
      <h1>내 설정</h1>

      {editing ? (
        <form className="setting__profile" onSubmit={handleNickname}>
          <CharacterCanvas character={profile.character} face className="setting__avatar" />
          <input
            type="text"
            className="setting__name-input"
            maxLength={10}
            required
            autoFocus
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="최대 10자"
            aria-label="닉네임"
          />
          <button type="button" className="setting__name-btn" onClick={() => setEditing(false)}>
            취소
          </button>
          <button type="submit" className="setting__name-btn is-primary" disabled={saving || !nickname.trim()}>
            {saving ? '저장 중' : '저장'}
          </button>
        </form>
      ) : (
        <button type="button" className="setting__profile" onClick={startEdit}>
          <CharacterCanvas character={profile.character} face className="setting__avatar" />
          <div className="setting__profile-text">
            <p className="setting__name">
              {profile.nickname}
              <PencilSimple size={14} />
            </p>
            <p className="setting__email">{profile.email}</p>
          </div>
        </button>
      )}

      <div className="setting__logout setting__premium">
        <div>
          <p className="setting__logout-title">프리미엄 구독</p>
          <p className="setting__logout-desc">프리미엄 기능을 모두 사용할 수 있어요</p>
        </div>
        <button type="button" className="setting__premium-btn" onClick={handleSubscribe}>
          <Crown size={16} weight="fill" />
          구독하기
        </button>
      </div>

      <div className="setting__card">
        <button type="button" className="setting__row" onClick={() => handleSelect('customize')}>
          <span>커스터마이징</span>
          <CaretRight size={18} />
        </button>
        <div className="setting__row">
          <span>알림 설정</span>
          <label className="setting__toggle">
            <span className={notifyOn ? 'setting__toggle-label is-on' : 'setting__toggle-label'}>
              {notifyOn ? '활성화됨' : '꺼짐'}
            </span>
            <input
              type="checkbox"
              checked={notifyOn}
              onChange={(e) => handleNotify(e.target.checked)}
            />
            <span className="setting__switch" />
          </label>
        </div>
        <button type="button" className="setting__row" onClick={() => handleSelect('backup')}>
          <span>백업</span>
          <CaretRight size={18} />
        </button>
        <button type="button" className="setting__row" onClick={() => handleSelect('storage')}>
          <span>데이터 및 저장공간</span>
          <CaretRight size={18} />
        </button>
        <button type="button" className="setting__row" onClick={() => handleSelect('notice')}>
          <span>공지사항</span>
          <CaretRight size={18} />
        </button>
      </div>

      <div className="setting__logout">
        <div>
          <p className="setting__logout-title">계정 로그아웃</p>
          <p className="setting__logout-desc">안전하게 기기에서 로그아웃합니다</p>
        </div>
        <button type="button" className="setting__logout-btn" onClick={handleLogout}>
          <SignOut size={16} />
          로그아웃
        </button>
      </div>

      <button type="button" className="setting__withdraw" onClick={handleWithdraw} disabled={leaving}>
        <Trash size={18} />
        {leaving ? '탈퇴 처리 중…' : '회원탈퇴 (데이터 초기화)'}
      </button>
      <p className="setting__warning">
        회원탈퇴 시 이 계정의 모든 일기·친구·프로필이 삭제되고 되돌릴 수 없어요.
      </p>
    </main>
  )
}

export default Setting
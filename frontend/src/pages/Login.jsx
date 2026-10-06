import { useEffect, useState } from 'react'
import { CaretLeft } from '@phosphor-icons/react'
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import { auth, googleProvider } from '../lib/firebase.js'

// 팝업을 사용자가 닫은 건 오류로 보지 않아요
const IGNORED_ERRORS = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']

const MESSAGES = {
  'auth/invalid-email': '이메일 주소를 다시 확인해주세요.',
  'auth/missing-password': '비밀번호를 입력해주세요.',
  'auth/weak-password': '비밀번호는 6자 이상으로 만들어주세요.',
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해주세요.',
  'auth/invalid-credential': '이메일이나 비밀번호가 맞지 않아요.',
  'auth/user-not-found': '가입되지 않은 이메일이에요.',
  'auth/wrong-password': '이메일이나 비밀번호가 맞지 않아요.',
  'auth/too-many-requests': '시도가 많았어요. 잠시 후 다시 해주세요.',
  'auth/operation-not-allowed': '이메일 로그인이 아직 열려 있지 않아요. 구글로 로그인해주세요.',
}

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z" />
  </svg>
)

function Login() {
  const [screen, setScreen] = useState('start') // 'start' | 'email'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // 첫 화면은 노랑, 이메일 화면은 흰색 — 상태바 뒤 캔버스 색까지 맞춰요
  useEffect(() => {
    const brand = screen === 'start'
    document.documentElement.classList.toggle('is-brand', brand)
    return () => document.documentElement.classList.remove('is-brand')
  }, [screen])

  // 로그인에 성공하면 App의 인증 상태 감지가 홈으로 보내줘요.
  async function run(task, { quiet } = {}) {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      await task()
    } catch (e) {
      console.error(e.code, e.message)
      if (!(quiet && IGNORED_ERRORS.includes(e.code))) {
        setError(MESSAGES[e.code] ?? '로그인에 실패했어요. 잠시 후 다시 시도해주세요.')
      }
    } finally {
      setLoading(false)
    }
  }

  const loginWithGoogle = () => run(() => signInWithPopup(auth, googleProvider), { quiet: true })

  function submitEmail(e) {
    e.preventDefault()
    run(() => signInWithEmailAndPassword(auth, email.trim(), password))
  }

  function signUp() {
    run(() => createUserWithEmailAndPassword(auth, email.trim(), password))
  }

  function resetPassword() {
    if (!email.trim()) return setError('비밀번호를 찾을 이메일을 먼저 적어주세요.')
    run(async () => {
      await sendPasswordResetEmail(auth, email.trim())
      setNotice('비밀번호 재설정 메일을 보냈어요.')
    })
  }

  if (screen === 'email') {
    return (
      <main className="login login--email">
        <button
          type="button"
          className="login__back"
          onClick={() => { setScreen('start'); setError(''); setNotice('') }}
          aria-label="뒤로가기"
        >
          <CaretLeft size={24} weight="bold" />
        </button>

        <img src="/logo.png" alt="" className="login__logo is-sm" />

        <form className="login__form" onSubmit={submitEmail}>
          <label className="login__field">
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@email.com"
              autoComplete="email"
              required
            />
          </label>
          <label className="login__field">
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
              autoComplete="current-password"
              required
            />
          </label>

          <button type="submit" className="login__submit" disabled={loading}>
            {loading ? '잠시만요…' : '로그인'}
          </button>

          <div className="login__links">
            <button type="button" onClick={resetPassword} disabled={loading}>비밀번호 찾기</button>
            <span aria-hidden="true">|</span>
            <button type="button" onClick={signUp} disabled={loading}>회원가입</button>
          </div>
        </form>

        {error && <p className="login__error" role="alert">{error}</p>}
        {notice && <p className="login__notice" role="status">{notice}</p>}

        <div className="login__bottom">
          <div className="login__or"><span>또는</span></div>
          <button type="button" className="login__google" onClick={loginWithGoogle} disabled={loading}>
            <GoogleMark /> Google로 로그인
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="login">
      <div className="login__hero">
        <img src="/logo.png" alt="" className="login__logo" />
      </div>

      <div className="login__brand">
        <img src="/wordmark.png" alt="삐뚤" className="login__wordmark" />
        <p className="login__tagline">당신의 하루를 기록하세요</p>
      </div>

      <div className="login__actions">
        <button type="button" className="login__start" onClick={() => setScreen('email')}>
          시작하기
        </button>
        <button type="button" className="login__signin" onClick={() => setScreen('email')}>
          로그인
        </button>
      </div>

      <p className="login__terms">
        계속하면 <a href="#terms">이용약관</a> 및 <a href="#privacy">개인정보처리방침</a>에<br />
        동의하는 것으로 간주돼요
      </p>
    </main>
  )
}

export default Login

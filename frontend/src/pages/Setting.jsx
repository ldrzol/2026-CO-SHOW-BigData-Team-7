import { useState } from 'react'
import { CaretRight, SignOut, Trash } from '@phosphor-icons/react'

function Setting() {
  const [notifyOn, setNotifyOn] = useState(true)

  function handleSelect(key) {
    // TODO: 각 설정 항목 화면으로 이동
    console.log(key)
  }

  function handleLogout() {
    // TODO: Firebase 연동 후 signOut(auth) 호출
  }

  function handleWithdraw() {
    // TODO: 회원탈퇴 처리 (데이터 초기화)
  }

  return (
    <main className="setting">
      <h1>내 설정</h1>

      <button type="button" className="setting__profile" onClick={() => handleSelect('profile')}>
        <img className="setting__avatar" src="/icon-192.png" alt="" />
        <div>
          <p className="setting__name">삐뚤이</p>
          <p className="setting__email">preview@bbiddul.app</p>
        </div>
      </button>

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
              onChange={(e) => setNotifyOn(e.target.checked)}
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

      <button type="button" className="setting__withdraw" onClick={handleWithdraw}>
        <Trash size={18} />
        회원탈퇴 (데이터 초기화)
      </button>
      <p className="setting__warning">
        회원탈퇴 시 이 계정의 모든 일기·친구·프로필이 삭제되고 되돌릴 수 없어요.
      </p>
    </main>
  )
}

export default Setting
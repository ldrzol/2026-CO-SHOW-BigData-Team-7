import { useState } from 'react'
import { CloudArrowUp } from '@phosphor-icons/react'
import BackHeader from '../components/BackHeader.jsx'

function Backup() {
  const [autoBackup, setAutoBackup] = useState(true)
  const [lastBackup] = useState(null) // TODO: Firebase 연동 후 마지막 백업 시각 조회

  function handleBackup() {
    // TODO: Firebase 연동 후 일기·친구·프로필 데이터 백업
  }

  return (
    <main className="sub">
      <BackHeader title="백업" />

      <div className="setting__card">
        <div className="setting__row">
          <span>마지막 백업</span>
          <span className="setting__value">
            {lastBackup ? lastBackup.toLocaleString('ko-KR') : '백업 기록 없음'}
          </span>
        </div>
        <div className="setting__row">
          <span>자동 백업</span>
          <label className="setting__toggle">
            <span className={autoBackup ? 'setting__toggle-label is-on' : 'setting__toggle-label'}>
              {autoBackup ? '활성화됨' : '꺼짐'}
            </span>
            <input
              type="checkbox"
              checked={autoBackup}
              onChange={(e) => setAutoBackup(e.target.checked)}
            />
            <span className="setting__switch" />
          </label>
        </div>
      </div>

      <button type="button" className="write__submit" onClick={handleBackup}>
        <CloudArrowUp size={18} weight="bold" /> 지금 백업하기
      </button>
      <p className="setting__warning">백업한 데이터는 내 계정에 안전하게 보관돼요.</p>
    </main>
  )
}

export default Backup

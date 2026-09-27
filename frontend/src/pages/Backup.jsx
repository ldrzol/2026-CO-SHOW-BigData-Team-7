import { useState } from 'react'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { DownloadSimple } from '@phosphor-icons/react'
import BackHeader from '../components/BackHeader.jsx'
import { auth, db } from '../lib/firebase.js'

const LAST_KEY = 'lastBackup'

async function readAll(uid) {
  const [profile, friends, diaries] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDocs(collection(db, 'users', uid, 'friends')),
    getDocs(collection(db, 'users', uid, 'diaries')),
  ])
  const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return { exportedAt: new Date().toISOString(), profile: profile.data(), friends: list(friends), diaries: list(diaries) }
}

function saveFile(file) {
  // 폰: 공유 창(파일에 저장, 드라이브 등) / 그 외: 바로 다운로드
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file] })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function Backup() {
  const [lastBackup, setLastBackup] = useState(() => {
    try {
      return localStorage.getItem(LAST_KEY)
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState(false)

  async function handleBackup() {
    setBusy(true)
    try {
      const data = await readAll(auth.currentUser.uid)
      const name = `삐뚤-백업-${new Date().toISOString().slice(0, 10)}.json`
      await saveFile(new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' }))
      const now = new Date().toISOString()
      setLastBackup(now)
      try {
        localStorage.setItem(LAST_KEY, now)
      } catch {
        /* 기록만 못 남길 뿐 백업은 끝났어요 */
      }
    } catch (e) {
      if (e.name !== 'AbortError') { // 공유 창을 닫은 경우는 무시
        console.error(e)
        window.alert('백업에 실패했어요. 잠시 후 다시 시도해주세요.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="sub">
      <BackHeader title="백업" />

      <div className="setting__card">
        <div className="setting__row">
          <span>마지막 백업</span>
          <span className="setting__value">
            {lastBackup ? new Date(lastBackup).toLocaleString('ko-KR') : '백업 기록 없음'}
          </span>
        </div>
      </div>

      <button type="button" className="write__submit" onClick={handleBackup} disabled={busy}>
        <DownloadSimple size={18} weight="bold" /> {busy ? '백업 중...' : '폰에 백업 파일 저장'}
      </button>
      <p className="setting__warning">
        일기·친구·프로필을 파일(.json)로 이 기기에 저장해요. 일기는 계정에도 자동으로 저장되고 있어요.
      </p>
    </main>
  )
}

export default Backup
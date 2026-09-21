import { useEffect, useState } from 'react'
import BackHeader from '../components/BackHeader.jsx'

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`
}

function Storage() {
  const [usage, setUsage] = useState(null) // { used, quota } | null(측정 불가)

  function measure() {
    navigator.storage?.estimate?.().then(({ usage: used, quota }) => setUsage({ used, quota }))
  }

  useEffect(measure, [])

  async function handleClearCache() {
    if (!window.confirm('캐시를 삭제할까요? 일기 데이터는 삭제되지 않아요.')) return
    const keys = await caches.keys()
    await Promise.all(keys.map((key) => caches.delete(key)))
    measure()
  }

  const percent = usage ? Math.min(100, (usage.used / usage.quota) * 100) : 0

  return (
    <main className="sub">
      <BackHeader title="데이터 및 저장공간" />

      <div className="setting__card storage">
        <p className="storage__title">앱 저장공간</p>
        {usage ? (
          <>
            <div className="storage__bar">
              <div className="storage__fill" style={{ width: `${Math.max(percent, 1)}%` }} />
            </div>
            <p className="setting__value">
              {formatBytes(usage.used)} 사용 중 / 최대 {formatBytes(usage.quota)}
            </p>
          </>
        ) : (
          <p className="setting__value">이 브라우저에서는 사용량을 확인할 수 없어요.</p>
        )}
      </div>

      <button type="button" className="write__submit" onClick={handleClearCache}>
        캐시 삭제
      </button>
      <p className="setting__warning">앱 실행 속도를 위해 저장된 임시 파일만 삭제돼요.</p>
    </main>
  )
}

export default Storage

import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../lib/firebase.js'
import { inPeriod, normalizeDiary } from '../lib/report.js'
import { analyzePending } from '../lib/reportData.js'

export default function useReportData() {
  const [diaries, setDiaries] = useState(null)
  const [events, setEvents] = useState([])
  const [error, setError] = useState(false)
  const [ai, setAi] = useState({ state: 'idle' })
  const alive = useRef(false)
  const busy = useRef(false)
  const queuedRange = useRef(null)

  const read = useCallback(async (name) => {
    const uid = auth.currentUser?.uid
    if (!uid) throw new Error('Sign-in required')
    const snap = await getDocs(collection(db, 'users', uid, name))
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
  }, [])

  const load = useCallback(async () => {
    try {
      const rows = await read('diaries')
      if (alive.current) { setDiaries(rows.filter((d) => !d.isDeleted).map(normalizeDiary)); setError(false) }
    } catch {
      if (alive.current) setError(true)
    }
  }, [read])

  useEffect(() => {
    alive.current = true
    // Firebase 조회 후 비동기로만 상태를 갱신하는 외부 데이터 동기화입니다.
    // oxlint-disable-next-line react/set-state-in-effect
    load()
    return () => { alive.current = false }
  }, [load])

  const loadAi = useCallback(async (range) => {
    if (!diaries) return
    queuedRange.current = range
    if (busy.current) return
    busy.current = true
    let latestDiaries = diaries
    try {
      // 기간을 바꾸어 열면 마지막으로 요청한 기간을 이어서 처리해요.
      while (queuedRange.current && alive.current) {
        const targetRange = queuedRange.current
        queuedRange.current = null
        setAi({ state: 'loading' })
        try {
          const saved = await read('events')
          if (!alive.current) return
          setEvents(saved)
          const call = httpsCallable(functions, 'analyzeDiary', { timeout: 300000 })
          const result = await analyzePending(inPeriod(latestDiaries, targetRange), call, (progress) => {
            setAi({ state: 'loading', ...progress })
          }, () => alive.current)
          if (!alive.current) return
          const [updatedDiaries, updatedEvents] = await Promise.all([read('diaries'), read('events')])
          if (!alive.current) return
          latestDiaries = updatedDiaries.filter((d) => !d.isDeleted).map(normalizeDiary)
          setDiaries(latestDiaries)
          setEvents(updatedEvents)
          setAi({ state: result.failed ? 'error' : 'ready' })
        } catch {
          if (alive.current) setAi({ state: 'error' })
        }
      }
    } finally {
      busy.current = false
    }
  }, [diaries, read])

  return { diaries, events, error, reload: load, ai, loadAi }
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, getDocs, onSnapshot } from 'firebase/firestore'
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

  const [attempt, setAttempt] = useState(0)
  const load = useCallback(() => setAttempt((n) => n + 1), [])

  // onSnapshot 은 기기에 저장된 사본을 먼저 주고, 서버 응답이 오면 다시 불러요.
  // 두 번째 방문부터는 기다리지 않고 바로 떠요
  useEffect(() => {
    alive.current = true
    const uid = auth.currentUser?.uid
    if (!uid) {
      // 로그인 상태는 Firebase 쪽 외부 상태라 effect 안에서만 알 수 있어요
      // oxlint-disable-next-line react/set-state-in-effect
      setError(true)
      return () => { alive.current = false }
    }
    const stop = onSnapshot(
      collection(db, 'users', uid, 'diaries'),
      (snap) => {
        if (!alive.current) return
        setDiaries(snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((d) => !d.isDeleted).map(normalizeDiary))
        setError(false)
      },
      () => { if (alive.current) setError(true) },
    )
    return () => { alive.current = false; stop() }
  }, [attempt])

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

import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase.js'

export async function isPushOn(uid) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  return (await getDoc(doc(db, 'pushTokens', uid))).exists()
}

export async function enablePush(uid) {
  if (!(await isSupported())) throw new Error('unsupported')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('denied')
  const token = await getToken(getMessaging(), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    // PWA 서비스워커(/)와 겹치지 않게 별도 scope로 등록
    serviceWorkerRegistration: await navigator.serviceWorker.register('/push-sw.js', { scope: '/push/' }),
  })
  await setDoc(doc(db, 'pushTokens', uid), { token, updatedAt: serverTimestamp() })
}

// 토큰 문서만 지우면 서버가 더 이상 보내지 않아요
export function disablePush(uid) {
  return deleteDoc(doc(db, 'pushTokens', uid))
}
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

// apiKey, appId: Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) 의 값을 frontend/.env.local 에 넣어주세요
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  authDomain: 'ppittul-bc359.firebaseapp.com',
  projectId: 'ppittul-bc359',
})

export const auth = getAuth(app)
// 데이터를 폰(IndexedDB)에도 저장해서 오프라인에서도 보이고, 다시 켤 때 빨라요
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
export const googleProvider = new GoogleAuthProvider()

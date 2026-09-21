import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// apiKey, appId: Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) 의 값을 frontend/.env.local 에 넣어주세요
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  authDomain: 'ppittul-bc359.firebaseapp.com',
  projectId: 'ppittul-bc359',
})

export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()

// firestore.rules 가 실제 앱 동작을 막지 않는지 에뮬레이터로 확인합니다.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, increment,
} from 'firebase/firestore'

const ME = 'me'
const FRIEND = 'friend'
const STRANGER = 'stranger'
const DATE = '2026-10-06'

let env

test('setup', async () => {
  env = await initializeTestEnvironment({
    projectId: 'ppittul-rules-test',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
  // 친구 관계와 상대 일기를 규칙 무시하고 미리 깔아둬요
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', ME), { nickname: '나', email: 'me@x.com' })
    await setDoc(doc(db, 'users', FRIEND), { nickname: '친구', email: 'f@x.com' })
    await setDoc(doc(db, 'users', ME, 'friends', FRIEND), { nickname: '친구' })
    await setDoc(doc(db, 'users', FRIEND, 'friends', ME), { nickname: '나' })
    await setDoc(doc(db, 'users', FRIEND, 'diaries', DATE), {
      diaryDate: DATE, body: '친구 일기', visibility: 'friends', isDeleted: false,
    })
    await setDoc(doc(db, 'users', FRIEND, 'diaries', '2026-10-01'), {
      diaryDate: '2026-10-01', body: '비공개', visibility: 'private', isDeleted: false,
    })
  })
})

const as = (uid) => env.authenticatedContext(uid).firestore()

test('일기 저장: 앱이 실제로 보내는 형태가 통과해야 함', async () => {
  const db = as(ME)
  await assertSucceeds(setDoc(doc(db, 'users', ME, 'diaries', DATE), {
    diaryDate: DATE,
    weather: '맑음',
    title: '오늘의 제목',
    body: '일기 내용',
    userEmotion: '행복',
    emotionIntensity: 3,
    satisfaction: 4,
    visibility: 'private',
    revision: increment(1),
    contentVersion: increment(1),
    isDeleted: false,
    updatedAt: serverTimestamp(),
  }, { merge: true }))
})

test('일기 수정: 같은 문서를 다시 덮어써도 통과해야 함', async () => {
  const db = as(ME)
  await assertSucceeds(setDoc(doc(db, 'users', ME, 'diaries', DATE), {
    diaryDate: DATE, title: '', body: '고친 내용', isDeleted: false,
    revision: increment(1), updatedAt: serverTimestamp(),
  }, { merge: true }))
})

test('일기: 문서 ID 와 다른 날짜, 1000자 초과, 20자 초과 제목은 막혀야 함', async () => {
  const db = as(ME)
  await assertFails(setDoc(doc(db, 'users', ME, 'diaries', DATE), { diaryDate: '2026-01-01', body: 'x' }))
  await assertFails(setDoc(doc(db, 'users', ME, 'diaries', DATE), { diaryDate: DATE, body: 'x'.repeat(1001) }))
  await assertFails(setDoc(doc(db, 'users', ME, 'diaries', DATE), { diaryDate: DATE, body: 'x', title: 'x'.repeat(21) }))
})

test('일기: 남의 일기는 못 씀', async () => {
  const db = as(STRANGER)
  await assertFails(setDoc(doc(db, 'users', ME, 'diaries', DATE), { diaryDate: DATE, body: 'x' }))
})

test('피드: 친구 공개 일기는 읽히고 비공개는 막힘', async () => {
  const db = as(ME)
  await assertSucceeds(getDoc(doc(db, 'users', FRIEND, 'diaries', DATE)))
  await assertFails(getDoc(doc(db, 'users', FRIEND, 'diaries', '2026-10-01')))
  await assertFails(getDoc(doc(as(STRANGER), 'users', FRIEND, 'diaries', DATE)))
})

test('공감: 친구 일기에 누르기 / 취소', async () => {
  const db = as(ME)
  const ref = doc(db, 'users', FRIEND, 'diaries', DATE, 'likes', ME)
  await assertSucceeds(setDoc(ref, { createdAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(ref))
  // 남의 이름으로는 못 누름
  await assertFails(setDoc(doc(db, 'users', FRIEND, 'diaries', DATE, 'likes', STRANGER), { createdAt: serverTimestamp() }))
})

test('알림 벨: 내 일기에 달린 공감·댓글을 내가 읽을 수 있어야 함', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', ME, 'diaries', DATE, 'likes', FRIEND), { createdAt: new Date() })
    await setDoc(doc(db, 'users', ME, 'diaries', DATE, 'comments', 'c1'), { uid: FRIEND, nickname: '친구', body: '좋다', createdAt: new Date() })
  })
  const db = as(ME)
  await assertSucceeds(getDoc(doc(db, 'users', ME, 'diaries', DATE, 'likes', FRIEND)))
  await assertSucceeds(getDoc(doc(db, 'users', ME, 'diaries', DATE, 'comments', 'c1')))
})

test('댓글: 정상 등록 / 닉네임 10자 초과·남의 uid 사칭은 막힘', async () => {
  const db = as(ME)
  const col = collection(db, 'users', FRIEND, 'diaries', DATE, 'comments')
  await assertSucceeds(addDoc(col, { uid: ME, nickname: '나', body: '댓글', createdAt: serverTimestamp() }))
  await assertFails(addDoc(col, { uid: ME, nickname: 'x'.repeat(11), body: '댓글', createdAt: serverTimestamp() }))
  await assertFails(addDoc(col, { uid: STRANGER, nickname: '나', body: '댓글', createdAt: serverTimestamp() }))
  await assertFails(addDoc(col, { uid: ME, nickname: '나', body: '', createdAt: serverTimestamp() }))
})

test('친구 요청: 정상 / 닉네임 초과는 막힘', async () => {
  const db = as(ME)
  await assertSucceeds(setDoc(doc(db, 'friendRequests', `${ME}_${STRANGER}`), {
    from: ME, to: STRANGER, fromNickname: '나', createdAt: serverTimestamp(),
  }))
  await assertFails(setDoc(doc(db, 'friendRequests', `${ME}_${'other'}`), {
    from: ME, to: 'other', fromNickname: 'x'.repeat(11), createdAt: serverTimestamp(),
  }))
})

test('알림 토큰: 켜기 / 끄기 모두 되어야 함', async () => {
  const db = as(ME)
  const ref = doc(db, 'pushTokens', ME)
  await assertSucceeds(setDoc(ref, { token: 'abc123', updatedAt: serverTimestamp() }))
  await assertSucceeds(deleteDoc(ref))
  await assertFails(setDoc(ref, { token: '', updatedAt: serverTimestamp() }))
  await assertFails(setDoc(doc(db, 'pushTokens', STRANGER), { token: 'abc', updatedAt: serverTimestamp() }))
})

test('닉네임 변경 / 캐릭터 저장', async () => {
  const db = as(ME)
  await assertSucceeds(updateDoc(doc(db, 'users', ME), { nickname: '새이름' }))
  await assertSucceeds(updateDoc(doc(db, 'users', ME), { character: { face: 1 } }))
  await assertFails(updateDoc(doc(db, 'users', ME), { nickname: 'x'.repeat(11) }))
})

test('teardown', async () => {
  await env.cleanup()
})

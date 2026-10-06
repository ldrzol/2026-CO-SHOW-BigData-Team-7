// users 읽기를 조인 뒤에도 앱이 멀쩡히 돌아가는지 확인합니다.
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, updateDoc, getDocs, query, collection, where, limit } from 'firebase/firestore'

const ME = 'me'
const FRIEND = 'friend'
const ASKER = 'asker'       // 나에게 친구 요청을 보낸 사람
const STRANGER = 'stranger' // 아무 관계 없는 사람

let env
const as = (uid, email) => env.authenticatedContext(uid, { email }).firestore()

test('setup', async () => {
  env = await initializeTestEnvironment({
    projectId: 'ppittul-rules2',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const [uid, email] of [[ME, 'me@x.com'], [FRIEND, 'f@x.com'], [ASKER, 'a@x.com'], [STRANGER, 's@x.com']]) {
      await setDoc(doc(db, 'users', uid), { nickname: uid, email, character: { face: 1 } })
    }
    // 나와 FRIEND 는 서로 친구
    await setDoc(doc(db, 'users', ME, 'friends', FRIEND), { nickname: 'friend' })
    await setDoc(doc(db, 'users', FRIEND, 'friends', ME), { nickname: 'me' })
    // ASKER 가 나에게 친구 요청을 보냄
    await setDoc(doc(db, 'friendRequests', `${ASKER}_${ME}`), { from: ASKER, to: ME, fromNickname: 'asker' })
  })
})

test('내 프로필은 읽을 수 있어야 함', async () => {
  await assertSucceeds(getDoc(doc(as(ME, 'me@x.com'), 'users', ME)))
})

test('친구 캐릭터는 읽을 수 있어야 함 (피드·친구목록)', async () => {
  await assertSucceeds(getDoc(doc(as(ME, 'me@x.com'), 'users', FRIEND)))
})

test('나에게 요청 보낸 사람 캐릭터도 읽을 수 있어야 함 (받은 요청 목록)', async () => {
  await assertSucceeds(getDoc(doc(as(ME, 'me@x.com'), 'users', ASKER)))
})

test('관계 없는 사람 프로필은 막혀야 함', async () => {
  await assertFails(getDoc(doc(as(ME, 'me@x.com'), 'users', STRANGER)))
})

test('이메일로 전체 사용자를 훑는 질의는 막혀야 함', async () => {
  const db = as(ME, 'me@x.com')
  await assertFails(getDocs(query(collection(db, 'users'), where('email', '==', 's@x.com'), limit(1))))
  await assertFails(getDocs(collection(db, 'users')))
})

test('내 프로필 저장: 내 이메일이면 통과, 남의 이메일이면 막힘', async () => {
  const db = as(ME, 'me@x.com')
  await assertSucceeds(setDoc(doc(db, 'users', ME), { nickname: '나', email: 'me@x.com' }))
  await assertFails(setDoc(doc(db, 'users', ME), { nickname: '나', email: 'f@x.com' }))
})

test('닉네임 변경·캐릭터 저장은 그대로 동작해야 함', async () => {
  const db = as(ME, 'me@x.com')
  await assertSucceeds(updateDoc(doc(db, 'users', ME), { nickname: '새이름' }))
  await assertSucceeds(updateDoc(doc(db, 'users', ME), { character: { face: 2 } }))
})

test('친구 수락 후에는 서로 프로필이 보여야 함', async () => {
  // ASKER 요청을 수락하는 흐름 그대로
  const db = as(ME, 'me@x.com')
  await assertSucceeds(setDoc(doc(db, 'users', ME, 'friends', ASKER), { nickname: 'asker' }))
  await assertSucceeds(setDoc(doc(db, 'users', ASKER, 'friends', ME), { nickname: 'me' }))
  await assertSucceeds(getDoc(doc(as(ASKER, 'a@x.com'), 'users', ME)))
})

test('teardown', async () => { await env.cleanup() })

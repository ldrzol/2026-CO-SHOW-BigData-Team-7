// deleteAccount 가 실제로 무엇을 지우는지 에뮬레이터에 데이터를 깔고 확인합니다.
// 함수 본체를 그대로 옮겨와 admin SDK 로 돌려요 (onCall 래퍼만 제외).
import assert from 'node:assert/strict'
import test from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
initializeApp({ projectId: 'ppittul-delete-test' })
const fs = getFirestore()

const ME = 'me'
const FRIEND = 'friend'

// index.ts 의 deleteAccount 본체와 같은 순서 (Storage·Auth 는 에뮬레이터 밖이라 뺌)
async function deleteAccountData(uid) {
  const friends = (await fs.collection(`users/${uid}/friends`).get()).docs.map((d) => d.id)
  for (const friendId of friends) {
    await fs.doc(`users/${friendId}/friends/${uid}`).delete().catch(() => {})
    const diaries = await fs.collection(`users/${friendId}/diaries`).listDocuments()
    for (const diary of diaries) {
      await diary.collection('likes').doc(uid).delete().catch(() => {})
      const mine = await diary.collection('comments').where('uid', '==', uid).get()
      await Promise.all(mine.docs.map((c) => c.ref.delete().catch(() => {})))
    }
  }
  for (const field of ['from', 'to']) {
    const reqs = await fs.collection('friendRequests').where(field, '==', uid).get()
    await Promise.all(reqs.docs.map((d) => d.ref.delete().catch(() => {})))
  }
  await fs.doc(`pushTokens/${uid}`).delete().catch(() => {})
  await fs.recursiveDelete(fs.doc(`users/${uid}`))
}

test('탈퇴하면 내 데이터와 남긴 흔적이 모두 사라지고, 친구 데이터는 남는다', async () => {
  // 내 데이터
  await fs.doc(`users/${ME}`).set({ nickname: '나', email: 'me@x.com' })
  await fs.doc(`users/${ME}/diaries/2026-10-01`).set({ diaryDate: '2026-10-01', body: '내 일기' })
  await fs.doc(`users/${ME}/diaries/2026-10-01/likes/${FRIEND}`).set({ createdAt: new Date() })
  await fs.doc(`users/${ME}/diaries/2026-10-01/comments/c1`).set({ uid: FRIEND, body: '좋다' })
  await fs.doc(`users/${ME}/events/e1`).set({ diaryDate: '2026-10-01' })
  await fs.doc(`users/${ME}/friends/${FRIEND}`).set({ nickname: '친구' })
  await fs.doc(`pushTokens/${ME}`).set({ token: 'abc' })

  // 친구 데이터 + 내가 남긴 흔적
  await fs.doc(`users/${FRIEND}`).set({ nickname: '친구', email: 'f@x.com' })
  await fs.doc(`users/${FRIEND}/friends/${ME}`).set({ nickname: '나' })
  await fs.doc(`users/${FRIEND}/diaries/2026-10-02`).set({ diaryDate: '2026-10-02', body: '친구 일기' })
  await fs.doc(`users/${FRIEND}/diaries/2026-10-02/likes/${ME}`).set({ createdAt: new Date() })
  await fs.doc(`users/${FRIEND}/diaries/2026-10-02/comments/c9`).set({ uid: ME, body: '내 댓글' })
  await fs.doc(`users/${FRIEND}/diaries/2026-10-02/comments/c8`).set({ uid: FRIEND, body: '친구 본인 댓글' })

  // 친구 요청 양방향
  await fs.doc(`friendRequests/${ME}_other`).set({ from: ME, to: 'other' })
  await fs.doc(`friendRequests/other_${ME}`).set({ from: 'other', to: ME })

  await deleteAccountData(ME)

  const gone = async (path) => !(await fs.doc(path).get()).exists
  const empty = async (path) => (await fs.collection(path).get()).empty

  // 내 것은 전부 사라져야 함
  assert.ok(await gone(`users/${ME}`), '프로필')
  assert.ok(await empty(`users/${ME}/diaries`), '일기')
  assert.ok(await empty(`users/${ME}/diaries/2026-10-01/likes`), '내 일기의 공감')
  assert.ok(await empty(`users/${ME}/diaries/2026-10-01/comments`), '내 일기의 댓글')
  assert.ok(await empty(`users/${ME}/events`), '분석 사건')
  assert.ok(await empty(`users/${ME}/friends`), '내 친구 목록')
  assert.ok(await gone(`pushTokens/${ME}`), '알림 토큰')
  assert.ok(await gone(`friendRequests/${ME}_other`), '보낸 요청')
  assert.ok(await gone(`friendRequests/other_${ME}`), '받은 요청')

  // 남의 글에 남긴 내 흔적도 사라져야 함
  assert.ok(await gone(`users/${FRIEND}/friends/${ME}`), '상대 친구목록에서 제거')
  assert.ok(await gone(`users/${FRIEND}/diaries/2026-10-02/likes/${ME}`), '친구 글의 내 공감')
  assert.ok(await gone(`users/${FRIEND}/diaries/2026-10-02/comments/c9`), '친구 글의 내 댓글')

  // 친구 데이터는 멀쩡해야 함
  assert.ok(!(await gone(`users/${FRIEND}`)), '친구 프로필 유지')
  assert.ok(!(await gone(`users/${FRIEND}/diaries/2026-10-02`)), '친구 일기 유지')
  assert.ok(!(await gone(`users/${FRIEND}/diaries/2026-10-02/comments/c8`)), '친구 본인 댓글 유지')
})

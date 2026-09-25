import { useEffect, useRef, useState } from 'react'
import { MagnifyingGlass, UserPlus, X } from '@phosphor-icons/react'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase.js'

// TODO: 캐릭터 기능이 생기면 사용자별 이미지로 교체
const CHARACTER = '/icon-192.png'

function Friend({ profile }) {
  const me = auth.currentUser.uid
  const [tab, setTab] = useState('feed')
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('')
  const [result, setResult] = useState() // undefined: 검색 전, null: 검색 결과 없음
  const [message, setMessage] = useState('')
  const addDialog = useRef(null)

  // 내 친구 목록 (실시간)
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users', me, 'friends'),
        (snap) => setFriends(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        console.error,
      ),
    [me],
  )

  // 나에게 온 친구 요청 (실시간)
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'friendRequests'), where('to', '==', me)),
        (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        console.error,
      ),
    [me],
  )

  async function handleSearch(e) {
    e.preventDefault()
    setMessage('')
    const email = new FormData(e.target).get('email').trim().toLowerCase()
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(1)))
      setResult(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() })
    } catch (err) {
      console.error(err)
      setMessage('검색에 실패했어요. 잠시 후 다시 시도해주세요.')
    }
  }

  async function sendRequest() {
    try {
      await setDoc(doc(db, 'friendRequests', `${me}_${result.id}`), {
        from: me,
        to: result.id,
        fromNickname: profile.nickname,
        createdAt: serverTimestamp(),
      })
      setMessage('친구 요청을 보냈어요.')
    } catch (err) {
      console.error(err)
      setMessage('이미 요청을 보냈거나 요청에 실패했어요.')
    }
  }

  async function accept(req) {
    const batch = writeBatch(db)
    batch.set(doc(db, 'users', me, 'friends', req.from), { nickname: req.fromNickname })
    batch.set(doc(db, 'users', req.from, 'friends', me), { nickname: profile.nickname })
    batch.delete(doc(db, 'friendRequests', req.id))
    await batch.commit().catch(console.error)
  }

  function reject(req) {
    deleteDoc(doc(db, 'friendRequests', req.id)).catch(console.error)
  }

  async function removeFriend(friend) {
    if (!confirm(`${friend.nickname}님을 친구에서 삭제할까요?`)) return
    const batch = writeBatch(db)
    batch.delete(doc(db, 'users', me, 'friends', friend.id))
    batch.delete(doc(db, 'users', friend.id, 'friends', me))
    await batch.commit().catch(console.error)
  }

  const isFriend = result && friends.some((f) => f.id === result.id)
  const shownFriends = friends.filter((f) => f.nickname.includes(filter.trim()))

  return (
    <main className="friend">
      <header className="friend__header">
        <h1>친구</h1>
        <button
          type="button"
          className="friend__icon-btn"
          aria-label="친구 추가"
          onClick={() => addDialog.current.showModal()}
        >
          <UserPlus size={22} />
        </button>
      </header>

      <dialog
        ref={addDialog}
        className="friend__dialog"
        onClose={() => {
          setResult(undefined)
          setMessage('')
        }}
      >
        <div className="friend__dialog-head">
          <h2>친구 추가</h2>
          <button
            type="button"
            className="friend__icon-btn"
            aria-label="닫기"
            onClick={() => addDialog.current.close()}
          >
            <X size={20} />
          </button>
        </div>
        <form className="friend__email" onSubmit={handleSearch}>
          <input name="email" type="email" required placeholder="친구의 이메일을 입력하세요" />
          <button type="submit" className="friend__btn is-primary">
            <MagnifyingGlass size={16} weight="bold" /> 검색
          </button>
        </form>
        {result === null && <p className="friend__sub">해당 이메일의 사용자가 없어요.</p>}
        {result && (
          <div className="friend__row friend__result">
            <img className="friend__avatar is-sm" src={CHARACTER} alt="" />
            <div className="friend__name">
              {result.nickname}
              <p className="friend__sub">{result.email}</p>
            </div>
            <button
              type="button"
              className="friend__btn is-primary"
              disabled={result.id === me || isFriend}
              onClick={sendRequest}
            >
              {result.id === me ? '나' : isFriend ? '친구' : '추가'}
            </button>
          </div>
        )}
        {message && <p className="friend__sub">{message}</p>}
      </dialog>

      <div className="friend__stories">
        <div className="friend__story">
          <img className="friend__avatar is-me" src={CHARACTER} alt="" />
          <span>내 캐릭터</span>
        </div>
        {friends.map(({ id, nickname }) => (
          <div key={id} className="friend__story">
            <img className="friend__avatar" src={CHARACTER} alt="" />
            <span>{nickname}</span>
          </div>
        ))}
      </div>

      <div className="friend__tabs">
        <button
          type="button"
          className={tab === 'feed' ? 'is-active' : ''}
          onClick={() => setTab('feed')}
        >
          친구 일기
        </button>
        <button
          type="button"
          className={tab === 'list' ? 'is-active' : ''}
          onClick={() => setTab('list')}
        >
          친구 목록
        </button>
      </div>

      {tab === 'feed' ? (
        // TODO: 일기 저장 기능이 생기면 친구들의 일기를 불러와서 보여주기
        <p className="friend__section">아직 친구 일기가 없어요.</p>
      ) : (
        <>
          <label className="friend__search">
            <MagnifyingGlass size={18} />
            <input
              type="search"
              placeholder="친구 검색"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>

          {requests.length > 0 && (
            <>
              <p className="friend__section">받은 요청 {requests.length}</p>
              <div className="setting__card">
                {requests.map((req) => (
                  <div key={req.id} className="friend__row">
                    <img className="friend__avatar is-sm" src={CHARACTER} alt="" />
                    <span className="friend__name">{req.fromNickname}</span>
                    <button type="button" className="friend__btn is-primary" onClick={() => accept(req)}>
                      수락
                    </button>
                    <button type="button" className="friend__btn" onClick={() => reject(req)}>
                      거절
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="friend__section">내 친구 {friends.length}</p>
          {shownFriends.length > 0 && (
            <div className="setting__card">
              {shownFriends.map((friend) => (
                <div key={friend.id} className="friend__row">
                  <img className="friend__avatar is-sm" src={CHARACTER} alt="" />
                  <span className="friend__name">{friend.nickname}</span>
                  <button type="button" className="friend__btn" onClick={() => removeFriend(friend)}>
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

export default Friend
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, ChatCircle, Heart, MagnifyingGlass, UserPlus, X } from '@phosphor-icons/react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '../lib/firebase.js'
import { addDays, todayKey } from '../lib/report.js'
import { DEFAULT_CHARACTER } from '../lib/character.js'
import CharacterCanvas from '../components/CharacterCanvas.jsx'
import EmotionIcon from '../components/EmotionIcon.jsx'

// 커스터마이징 전 사용자도 있을 수 있어서 기본 캐릭터로 떨어뜨려요
const Avatar = ({ character, className }) => (
  <CharacterCanvas character={character ?? DEFAULT_CHARACTER} face className={className} />
)

// uid 로 그 사람의 캐릭터만 꺼내요 (users 문서는 로그인하면 누구나 읽을 수 있어요)
const characterOf = (uid) => getDoc(doc(db, 'users', uid)).then((s) => s.data()?.character)

// 알림을 마지막으로 확인한 시각 — 기기에만 남겨요 (시크릿 모드에선 접근이 막힐 수 있어요)
const SEEN_KEY = 'ppittul.alarmSeen'
const readSeen = () => {
  try {
    return Number(localStorage.getItem(SEEN_KEY) || 0)
  } catch {
    return 0
  }
}
const writeSeen = (at) => {
  try {
    localStorage.setItem(SEEN_KEY, String(at))
  } catch {
    /* 저장 못 해도 이번 화면에서는 읽음으로 보여요 */
  }
}
const millis = (ts) => ts?.toMillis?.() ?? 0

// ponytail: 글마다 공감·댓글을 따로 구독해요. 피드가 길어지면 리스너가 늘어나니 그때 페이지네이션으로
function FriendPost({ post, me, myNickname, onActivity }) {
  const base = `users/${post.uid}/diaries/${post.diaryDate}`
  const [likes, setLikes] = useState([])
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(
    () =>
      onSnapshot(
        collection(db, base, 'likes'),
        (snap) => setLikes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        console.error,
      ),
    [base],
  )

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, base, 'comments'), orderBy('createdAt')),
        (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        console.error,
      ),
    [base],
  )

  // 내 일기에 달린 반응만 알림으로 모아요 (내가 누른 건 빼고요)
  useEffect(() => {
    if (post.uid !== me) return
    onActivity(post.key, [
      ...likes.filter((l) => l.id !== me).map((l) => ({ id: `${post.key}_like_${l.id}`, uid: l.id, kind: '공감', at: millis(l.createdAt) })),
      ...comments.filter((c) => c.uid !== me).map((c) => ({ id: `${post.key}_cmt_${c.id}`, uid: c.uid, name: c.nickname, kind: '댓글', body: c.body, at: millis(c.createdAt) })),
    ].map((a) => ({ ...a, diaryDate: post.diaryDate })))
  }, [post.uid, post.key, post.diaryDate, me, likes, comments, onActivity])

  const liked = likes.some((l) => l.id === me)

  function toggleLike() {
    const ref = doc(db, base, 'likes', me)
    const run = liked ? deleteDoc(ref) : setDoc(ref, { createdAt: serverTimestamp() })
    run.catch(console.error)
  }

  function addComment(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    addDoc(collection(db, base, 'comments'), {
      uid: me,
      nickname: myNickname,
      body,
      createdAt: serverTimestamp(),
    }).catch(console.error)
  }

  return (
    <article className="friend__post">
      <div className="friend__post-head">
        <Avatar character={post.character} className="friend__avatar is-sm" />
        <div className="friend__name">
          {post.uid === me ? `${post.nickname} (나)` : post.nickname}
          <p className="friend__sub">{post.diaryDate}</p>
        </div>
        <EmotionIcon emotion={post.userEmotion} size={28} decorative />
      </div>

      {/* 피드에는 그림일기만 보여줘요. 본문은 그림 안에 이미 적혀 있어요 */}
      {post.imageUrl ? (
        <div className="friend__picture">
          <img src={post.imageUrl} alt={post.title || '그림일기'} />
        </div>
      ) : (
        <p className="friend__post-text">그림은 아직 없어요</p>
      )}
      {post.title && <p className="friend__post-title">{post.title}</p>}

      <div className="friend__reactions">
        <button
          type="button"
          className={liked ? 'is-liked' : ''}
          aria-pressed={liked}
          onClick={toggleLike}
        >
          <Heart size={20} weight={liked ? 'fill' : 'regular'} />
          {likes.length}
        </button>
        <button type="button" onClick={() => setOpen(!open)}>
          <ChatCircle size={20} />
          {comments.length}
        </button>
      </div>

      {open && (
        <div className="friend__comments">
          {comments.map((c) => (
            <p key={c.id} className="friend__post-text">
              <strong>{c.nickname}</strong> {c.body}
              {(c.uid === me || post.uid === me) && (
                <button
                  type="button"
                  className="friend__comment-del"
                  aria-label="댓글 삭제"
                  onClick={() => deleteDoc(doc(db, base, 'comments', c.id)).catch(console.error)}
                >
                  <X size={14} />
                </button>
              )}
            </p>
          ))}
          <form className="friend__email" onSubmit={addComment}>
            <input
              value={text}
              maxLength={200}
              placeholder="댓글을 남겨보세요"
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="friend__btn is-primary" disabled={!text.trim()}>
              등록
            </button>
          </form>
        </div>
      )}
    </article>
  )
}

function Friend({ profile }) {
  const me = auth.currentUser.uid
  const [tab, setTab] = useState('feed')
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])
  const [feed, setFeed] = useState([])
  const [filter, setFilter] = useState('')
  const [result, setResult] = useState() // undefined: 검색 전, null: 검색 결과 없음
  const [message, setMessage] = useState('')
  const [activity, setActivity] = useState({}) // { 글키: [반응] }
  const [seen, setSeen] = useState(readSeen)
  const addDialog = useRef(null)
  const alarmDialog = useRef(null)

  // 내 친구 목록 (실시간) — 닉네임은 친구 문서에, 캐릭터는 상대 프로필에서
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users', me, 'friends'),
        async (snap) =>
          setFriends(
            await Promise.all(
              snap.docs.map(async (d) => ({ id: d.id, ...d.data(), character: await characterOf(d.id) })),
            ),
          ),
        console.error,
      ),
    [me],
  )

  // 나에게 온 친구 요청 (실시간)
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'friendRequests'), where('to', '==', me)),
        async (snap) =>
          setRequests(
            await Promise.all(
              snap.docs.map(async (d) => ({
                id: d.id,
                ...d.data(),
                character: await characterOf(d.data().from),
              })),
            ),
          ),
        console.error,
      ),
    [me],
  )

  // 친구들과 내 '친구 공개' 일기 — 최근 90일치만 모아요
  useEffect(() => {
    const since = addDays(todayKey(), -90) // 문서 ID 가 날짜라 ID 범위로 자를 수 있어요
    const people = [{ id: me, nickname: profile.nickname, character: profile.character }, ...friends]
    Promise.all(
      people.map(({ id, nickname, character }) =>
        getDocs(
          query(
            collection(db, 'users', id, 'diaries'),
            where('visibility', '==', 'friends'),
            where(documentId(), '>=', since),
          ),
        ).then((snap) =>
          snap.docs.map((d) => ({ key: `${id}_${d.id}`, uid: id, nickname, character, ...d.data() })),
        ),
      ),
    )
      .then((all) =>
        setFeed(all.flat().filter((d) => !d.isDeleted).sort((a, b) => b.diaryDate.localeCompare(a.diaryDate))),
      )
      .catch(console.error)
  }, [friends, me, profile.nickname, profile.character])

  const handleActivity = useCallback((key, items) => {
    setActivity((prev) => (prev[key]?.length === items.length && items.every((it, i) => prev[key][i].id === it.id) ? prev : { ...prev, [key]: items }))
  }, [])

  const alarms = Object.values(activity).flat().sort((a, b) => b.at - a.at)
  const unseen = alarms.filter((a) => a.at > seen).length
  const nameOf = (uid) => friends.find((f) => f.id === uid)?.nickname ?? '친구'

  function openAlarms() {
    alarmDialog.current.showModal()
    const now = Date.now()
    writeSeen(now)
    setSeen(now)
  }

  // 전체 사용자 목록은 닫혀 있어서 검색은 서버 함수가 대신 해줘요
  async function handleSearch(e) {
    e.preventDefault()
    setMessage('')
    const email = new FormData(e.target).get('email').trim().toLowerCase()
    try {
      const { data } = await httpsCallable(functions, 'findFriend')({ email })
      setResult(data.found ? { ...data, email } : null)
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
          className="friend__icon-btn friend__bell"
          aria-label={unseen ? `알림 ${unseen}개` : '알림'}
          onClick={openAlarms}
        >
          <Bell size={22} weight={unseen ? 'fill' : 'regular'} />
          {unseen > 0 && <span className="friend__badge">{unseen > 9 ? '9+' : unseen}</span>}
        </button>
        <button
          type="button"
          className="friend__icon-btn"
          aria-label="친구 추가"
          onClick={() => addDialog.current.showModal()}
        >
          <UserPlus size={22} />
        </button>
      </header>

      <dialog ref={alarmDialog} className="friend__dialog">
        <div className="friend__dialog-head">
          <h2>알림</h2>
          <button
            type="button"
            className="friend__icon-btn"
            aria-label="닫기"
            onClick={() => alarmDialog.current.close()}
          >
            <X size={20} />
          </button>
        </div>
        {alarms.length === 0 ? (
          <p className="friend__sub">아직 받은 반응이 없어요.</p>
        ) : (
          alarms.slice(0, 30).map((a) => (
            <p key={a.id} className={a.at > seen ? 'friend__alarm is-new' : 'friend__alarm'}>
              <strong>{a.name ?? nameOf(a.uid)}</strong>님이 {a.diaryDate} 일기에 {a.kind}을 남겼어요
              {a.body && <span className="friend__sub">{a.body}</span>}
            </p>
          ))
        )}
      </dialog>

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
            <Avatar character={result.character} className="friend__avatar is-sm" />
            <div className="friend__name">
              {result.nickname}
              <p className="friend__sub">{result.email}</p>
            </div>
            <button
              type="button"
              className="friend__btn is-primary"
              disabled={result.isMe || isFriend}
              onClick={sendRequest}
            >
              {result.isMe ? '나' : isFriend ? '친구' : '추가'}
            </button>
          </div>
        )}
        {message && <p className="friend__sub">{message}</p>}
      </dialog>

      <div className="friend__stories">
        <div className="friend__story">
          <Avatar character={profile.character} className="friend__avatar is-me" />
          <span>내 캐릭터</span>
        </div>
        {friends.map(({ id, nickname, character }) => (
          <div key={id} className="friend__story">
            <Avatar character={character} className="friend__avatar" />
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
        feed.length === 0 ? (
          <p className="friend__section">아직 친구 일기가 없어요.</p>
        ) : (
          feed.map((d) => (
            <FriendPost key={d.key} post={d} me={me} myNickname={profile.nickname} onActivity={handleActivity} />
          ))
        )
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
                    <Avatar character={req.character} className="friend__avatar is-sm" />
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
                  <Avatar character={friend.character} className="friend__avatar is-sm" />
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

import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import BackHeader from '../components/BackHeader.jsx'
import { auth, db } from '../lib/firebase.js'

const noticesRef = collection(db, 'notices')

function Notice() {
  const [notices, setNotices] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  useEffect(
    () =>
      onSnapshot(
        query(noticesRef, orderBy('createdAt', 'desc')),
        (snap) => setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        console.error,
      ),
    [],
  )

  useEffect(() => {
    getDoc(doc(db, 'admins', auth.currentUser.uid))
      .then((snap) => setIsAdmin(snap.exists()))
      .catch(console.error)
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    try {
      await addDoc(noticesRef, { title: title.trim(), body: body.trim(), createdAt: serverTimestamp() })
      setTitle('')
      setBody('')
    } catch (err) {
      console.error(err)
      window.alert('공지 등록에 실패했어요.')
    }
  }

  function handleDelete(id) {
    if (window.confirm('이 공지를 삭제할까요?')) deleteDoc(doc(db, 'notices', id)).catch(console.error)
  }

  return (
    <main className="sub">
      <BackHeader title="공지사항" />

      {isAdmin && (
        <form className="setting__card notice__form" onSubmit={handleAdd}>
          <input
            className="write__input"
            maxLength={50}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="공지 제목"
          />
          <textarea
            className="write__textarea"
            maxLength={2000}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="공지 내용"
          />
          <button type="submit" className="write__submit" disabled={!title.trim() || !body.trim()}>
            공지 등록
          </button>
        </form>
      )}

      {notices.length === 0 ? (
        <p className="setting__warning">등록된 공지사항이 없어요.</p>
      ) : (
        <div className="setting__card">
          {notices.map(({ id, title, body, createdAt }) => (
            <details key={id} className="notice">
              <summary className="setting__row notice__summary">
                <span>{title}</span>
                <span className="setting__value">
                  {createdAt ? createdAt.toDate().toLocaleDateString('ko-KR') : '방금'}
                </span>
              </summary>
              <p className="notice__body">
                {body}
                {isAdmin && (
                  <button type="button" className="notice__delete" onClick={() => handleDelete(id)}>
                    삭제
                  </button>
                )}
              </p>
            </details>
          ))}
        </div>
      )}
    </main>
  )
}

export default Notice
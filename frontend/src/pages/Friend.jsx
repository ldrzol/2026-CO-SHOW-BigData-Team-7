import { useRef, useState } from 'react'
import { ChatCircle, Heart, MagnifyingGlass, UserPlus, X } from '@phosphor-icons/react'

// TODO: Firebase 연동 후 친구별 캐릭터 이미지·일기·요청 목록으로 교체
const CHARACTER = '/icon-192.png'
const FRIENDS = [
  { id: 1, name: '민지' },
  { id: 2, name: '서준' },
  { id: 3, name: '하윤' },
  { id: 4, name: '도현' },
  { id: 5, name: '지아' },
]
const REQUESTS = [{ id: 6, name: '유나' }]
const POSTS = [
  { id: 1, name: '민지', date: '9월 19일', mood: '😊', title: '오랜만에 한강 산책', text: '날씨가 좋아서 저녁에 한강까지 걸었다. 바람이 시원해서 기분이 좋았다.', likes: 12, comments: 3 },
  { id: 2, name: '서준', date: '9월 18일', mood: '😪', title: '시험 끝!', text: '드디어 중간고사가 끝났다. 집에 오자마자 기절하듯 잠들었다.', likes: 8, comments: 1 },
]

function Friend() {
  const [tab, setTab] = useState('feed')
  const [searched, setSearched] = useState(false)
  const addDialog = useRef(null)

  function handleSearch(e) {
    e.preventDefault()
    // TODO: Firebase 연동 후 이메일로 사용자 검색
    setSearched(true)
  }

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

      <dialog ref={addDialog} className="friend__dialog" onClose={() => setSearched(false)}>
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
          <input type="email" required placeholder="친구의 이메일을 입력하세요" />
          <button type="submit" className="friend__btn is-primary">
            <MagnifyingGlass size={16} weight="bold" /> 검색
          </button>
        </form>
        {searched && (
          <div className="friend__row friend__result">
            <img className="friend__avatar is-sm" src={CHARACTER} alt="" />
            <div className="friend__name">
              유나
              <p className="friend__sub">yuna@example.com</p>
            </div>
            <button type="button" className="friend__btn is-primary">추가</button>
          </div>
        )}
      </dialog>

      <div className="friend__stories">
        <div className="friend__story">
          <img className="friend__avatar is-me" src={CHARACTER} alt="" />
          <span>내 캐릭터</span>
        </div>
        {FRIENDS.map(({ id, name }) => (
          <div key={id} className="friend__story">
            <img className="friend__avatar" src={CHARACTER} alt="" />
            <span>{name}</span>
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
        POSTS.map(({ id, name, date, mood, title, text, likes, comments }) => (
          <article key={id} className="friend__post">
            <div className="friend__post-head">
              <img className="friend__avatar is-sm" src={CHARACTER} alt="" />
              <div>
                <p className="friend__name">{name}</p>
                <p className="friend__sub">{date}</p>
              </div>
              <span className="friend__mood">{mood}</span>
            </div>
            <div className="friend__picture">
              <img src="/icon-512.png" alt="" />
            </div>
            <p className="friend__post-title">{title}</p>
            <p className="friend__post-text">{text}</p>
            <div className="friend__reactions">
              <button type="button" aria-label="좋아요">
                <Heart size={22} /> {likes}
              </button>
              <button type="button" aria-label="댓글">
                <ChatCircle size={22} /> {comments}
              </button>
            </div>
          </article>
        ))
      ) : (
        <>
          <label className="friend__search">
            <MagnifyingGlass size={18} />
            <input type="search" placeholder="친구 검색" />
          </label>

          <p className="friend__section">받은 요청 {REQUESTS.length}</p>
          <div className="setting__card">
            {REQUESTS.map(({ id, name }) => (
              <div key={id} className="friend__row">
                <img className="friend__avatar is-sm" src={CHARACTER} alt="" />
                <span className="friend__name">{name}</span>
                <button type="button" className="friend__btn is-primary">수락</button>
                <button type="button" className="friend__btn">거절</button>
              </div>
            ))}
          </div>

          <p className="friend__section">내 친구 {FRIENDS.length}</p>
          <div className="setting__card">
            {FRIENDS.map(({ id, name }) => (
              <div key={id} className="friend__row">
                <img className="friend__avatar is-sm" src={CHARACTER} alt="" />
                <span className="friend__name">{name}</span>
                <button type="button" className="friend__btn">삭제</button>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

export default Friend

import BackHeader from '../components/BackHeader.jsx'

// TODO: 서버 연동 후 공지사항 목록 조회로 교체
const NOTICES = []

function Notice() {
  return (
    <main className="sub">
      <BackHeader title="공지사항" />

      {NOTICES.length === 0 ? (
        <p className="setting__warning">등록된 공지사항이 없어요.</p>
      ) : (
        <div className="setting__card">
          {NOTICES.map(({ id, title, date, body }) => (
            <details key={id} className="notice">
              <summary className="setting__row notice__summary">
                <span>{title}</span>
                <span className="setting__value">{date}</span>
              </summary>
              <p className="notice__body">{body}</p>
            </details>
          ))}
        </div>
      )}
    </main>
  )
}

export default Notice

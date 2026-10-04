import { useEffect, useRef } from 'react'

export default function EvidenceDialog({ title, events = [], diaries = [], onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const el = dialog.current
    el.showModal()
    return () => { el.close(); previous?.focus() }
  }, [])
  return (
    <dialog ref={dialog} className="evidence" aria-label={title} onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="evidence__panel">
        <div className="evidence__head"><h2>{title}</h2><button autoFocus type="button" aria-label="닫기" onClick={onClose}>✕</button></div>
        {!events.length && !diaries.length && <p className="analyze__empty">해당하는 기록이 없어요.</p>}
        <ul className="evidence__list">
          {events.map((e) => <li key={e.eventId ?? e.id}><small>{e.diaryDate}</small><p>{e.evidenceText}</p></li>)}
          {diaries.map((d) => <li key={d.diaryDate}><small>{d.diaryDate} · {d.userEmotion}</small><h3>{d.title || '제목 없는 일기'}</h3><p>{d.body}</p></li>)}
        </ul>
      </div>
    </dialog>
  )
}

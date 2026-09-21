import { useNavigate } from 'react-router-dom'
import { CaretLeft } from '@phosphor-icons/react'

function BackHeader({ title }) {
  const navigate = useNavigate()

  return (
    <header className="write__header">
      <button type="button" className="write__back" onClick={() => navigate(-1)} aria-label="뒤로가기">
        <CaretLeft size={20} />
      </button>
      <h1 className="write__title">{title}</h1>
    </header>
  )
}

export default BackHeader

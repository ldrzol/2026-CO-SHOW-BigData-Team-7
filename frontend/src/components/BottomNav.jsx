import { NavLink } from 'react-router-dom'
import { House, Notebook, BookOpen, UsersThree, UserCircle } from '@phosphor-icons/react'

const tabs = [
  { to: '/book', label: '책', Icon: BookOpen },
  { to: '/diary', label: '다이어리', Icon: Notebook },
  { to: '/', label: '홈', Icon: House },
  { to: '/friend', label: '친구', Icon: UsersThree },
  { to: '/my', label: '마이', Icon: UserCircle },
]

function BottomNav() {
  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            isActive ? 'bottom-nav__item is-active' : 'bottom-nav__item'
          }
        >
          {({ isActive }) => <Icon size={26} weight={isActive ? 'fill' : 'regular'} />}
        </NavLink>
      ))}
    </nav>
  )
}

export default BottomNav
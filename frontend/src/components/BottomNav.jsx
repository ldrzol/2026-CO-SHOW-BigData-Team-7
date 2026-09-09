import { NavLink } from 'react-router-dom'
import { House, ChartBar, BookOpen, UsersThree, Gear } from '@phosphor-icons/react'

const tabs = [
  { to: '/book', label: '일기책', Icon: BookOpen },
  { to: '/analyze', label: '분석', Icon: ChartBar },
  { to: '/', label: '홈', Icon: House },
  { to: '/friend', label: '친구', Icon: UsersThree },
  { to: '/setting', label: '설정', Icon: Gear },
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
          {({ isActive }) => (
            <>
              <Icon size={26} weight={isActive ? 'fill' : 'regular'} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default BottomNav
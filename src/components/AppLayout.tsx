import { NavLink, Outlet } from 'react-router-dom'
import {
  CalendarDays,
  FileText,
  LayoutDashboard,
  Library,
  LogOut,
  Moon,
  Settings,
  Sun,
  Tags,
  Rss,
  Activity,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { Button, cx } from './ui'

const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/brand', label: 'Brand', icon: Tags },
  { to: '/sources', label: 'Sources', icon: Rss },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/runs', label: 'Runs', icon: Activity },
]

export function AppLayout() {
  const { signOut, user } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-4 md:flex-row md:gap-6 md:p-6">
      <aside className="md:sticky md:top-6 md:h-[calc(100vh-3rem)] md:w-64 md:shrink-0">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)]">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Content OS</p>
            <h1 className="font-display mt-1 text-2xl font-bold">Absar Alam</h1>
            <p className="mt-1 truncate text-xs text-[var(--muted)]">{user?.email}</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Primary">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition',
                    isActive
                      ? 'bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[var(--accent)]'
                      : 'text-[var(--muted)] hover:bg-[color-mix(in_oklab,var(--ink)_5%,transparent)] hover:text-[var(--ink)]',
                  )
                }
              >
                <Icon size={16} aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-6 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={toggle} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </Button>
            <Button variant="ghost" onClick={() => void signOut()} aria-label="Sign out">
              <LogOut size={16} />
            </Button>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]">
            <FileText size={12} /> Asia/Karachi · personal dashboard
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 pb-10">
        <Outlet />
      </main>
    </div>
  )
}

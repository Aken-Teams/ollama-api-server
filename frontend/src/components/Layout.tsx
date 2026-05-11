import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import {
  LayoutDashboard, Zap, BarChart2, FileImage, KeyRound,
  Users, Activity, BookOpen, LogOut, Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  path: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { path: '/', label: '總覽', icon: <LayoutDashboard size={17} /> },
  { path: '/tools/test', label: '模型測試', icon: <Zap size={17} /> },
  { path: '/tools/models', label: '效能比較', icon: <BarChart2 size={17} /> },
  { path: '/tools/ocr', label: 'OCR 工具', icon: <FileImage size={17} /> },
  { path: '/admin/keys', label: 'Key 管理', icon: <KeyRound size={17} />, adminOnly: true },
  { path: '/admin/users', label: '使用者', icon: <Users size={17} />, adminOnly: true },
  { path: '/admin/usage', label: '使用記錄', icon: <Activity size={17} />, adminOnly: true },
  { path: '/docs', label: 'API 文檔', icon: <BookOpen size={17} /> },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  const visibleItems = navItems.filter(item => !item.adminOnly || user?.is_admin)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="group/sidebar w-12 hover:w-44 flex flex-col bg-white border-r border-gray-100 shrink-0 transition-[width] duration-200 overflow-hidden">
        {/* Logo */}
        <div className="flex items-center h-11 border-b border-gray-100 shrink-0 px-3 gap-2.5">
          <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-[10px]">PJ</span>
          </div>
          <span className="text-sm font-semibold text-gray-700 whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 delay-75">
            PJ_API
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col py-2 gap-0.5 overflow-y-auto overflow-x-hidden">
          {visibleItems.map((item) => {
            const active = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className={cn(
                  'mx-1.5 h-9 flex items-center gap-2.5 px-2 rounded-lg transition-colors whitespace-nowrap',
                  active
                    ? 'bg-amber-50 text-amber-600'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                )}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="text-sm opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 delay-75">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="flex flex-col gap-1 pb-2 border-t border-gray-100 pt-2 overflow-hidden">
          {user?.is_admin && (
            <div className="mx-1.5 h-9 flex items-center gap-2.5 px-2">
              <Shield size={13} className="text-amber-400 shrink-0" />
              <span className="text-xs text-amber-500 whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 delay-75">
                管理員
              </span>
            </div>
          )}
          <div className="mx-1.5 h-9 flex items-center gap-2.5 px-2">
            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-medium text-gray-600">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <span className="text-sm text-gray-600 whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 delay-75">
              {user?.username}
            </span>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            title="登出"
            className="mx-1.5 h-9 flex items-center gap-2.5 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={15} className="shrink-0" />
            <span className="text-sm whitespace-nowrap opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-150 delay-75">
              登出
            </span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}

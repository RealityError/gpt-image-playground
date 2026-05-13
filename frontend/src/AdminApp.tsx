import { useEffect, useState, useCallback } from 'react'
import { getAdminSession, loginAdmin, logoutAdmin } from './lib/adminApi'
import AdminDashboard from './admin/AdminDashboard'
import AdminGallery from './admin/AdminGallery'
import AdminJobs from './admin/AdminJobs'
import AdminOwners from './admin/AdminOwners'
import AdminAuth from './admin/AdminAuth'
import AdminSystem from './admin/AdminSystem'

type TabKey = 'dashboard' | 'gallery' | 'jobs' | 'owners' | 'auth' | 'system'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'dashboard', label: '仪表盘' },
  { key: 'gallery', label: '图库' },
  { key: 'jobs', label: '任务' },
  { key: 'owners', label: '空间主' },
  { key: 'auth', label: '鉴权日志' },
  { key: 'system', label: '系统' },
]

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [password, setPassword] = useState('')
  const [loginStatus, setLoginStatus] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const data = await getAdminSession()
        setAuthenticated(Boolean(data.authenticated))
      } catch {
        setAuthenticated(false)
      } finally {
        setChecking(false)
      }
    })()
  }, [])

  const handleLogin = useCallback(async () => {
    const value = password.trim()
    if (!value) {
      setLoginStatus('请输入密码')
      return
    }
    setLoginStatus('登录中...')
    try {
      const data = await loginAdmin(value)
      if (data.ok) {
        setAuthenticated(true)
        setPassword('')
        setLoginStatus('')
      } else {
        setLoginStatus('密码错误')
      }
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : '登录失败')
    }
  }, [password])

  const handleLogout = useCallback(async () => {
    try {
      await logoutAdmin()
    } catch {
      /* ignore */
    }
    setAuthenticated(false)
  }, [])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-gray-500 dark:text-gray-400">检查中...</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/70 backdrop-blur px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-white/10 shadow-2xl p-5 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">管理控制台</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">输入管理员密码登录</p>
          </div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleLogin() }}
            type="password"
            autoFocus
            className="w-full rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-gray-900 px-3 py-2.5 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-gray-900/10"
            placeholder="管理员密码"
          />
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => void handleLogin()}
              className="rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-950 px-4 py-2.5 font-semibold"
            >
              登录
            </button>
            {loginStatus && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{loginStatus}</span>
            )}
          </div>
          <div className="text-center">
            <a href="/" className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
              返回首页
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">管理控制台</h1>
            <a
              href="/"
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1"
            >
              返回首页
            </a>
          </div>
          <button
            onClick={() => void handleLogout()}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-1.5"
          >
            退出登录
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab Content */}
      <main className="max-w-7xl mx-auto px-4 py-5">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'gallery' && <AdminGallery />}
        {activeTab === 'jobs' && <AdminJobs />}
        {activeTab === 'owners' && <AdminOwners />}
        {activeTab === 'auth' && <AdminAuth />}
        {activeTab === 'system' && <AdminSystem />}
      </main>
    </div>
  )
}

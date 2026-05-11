import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { login } from '@/api/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login: storeLogin } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await login(username, password)
      storeLogin(res.user, res.api_key)
      navigate('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e.response?.data?.detail || '帳號或密碼錯誤')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-sm">PJ</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">PJ_API 管理系統</h1>
          <p className="text-sm text-gray-400 mt-1">請登入以繼續</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">帳號</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="輸入帳號"
                autoComplete="username"
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">密碼</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="輸入密碼"
                autoComplete="current-password"
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {loading ? '登入中...' : '登入'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

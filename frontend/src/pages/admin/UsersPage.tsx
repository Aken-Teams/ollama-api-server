import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchUsers } from '@/api/stats'
import apiClient from '@/api/client'
import { Plus, Loader2, X, Users } from 'lucide-react'

interface User {
  id?: number
  username: string
  is_admin?: boolean
  created_at?: string
  key_count?: number
}

export default function UsersPage() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', is_admin: false })

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  })

  const createMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; is_admin: boolean }) => {
      const res = await apiClient.post('/api/users', data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      setCreateOpen(false)
      setForm({ username: '', password: '', is_admin: false })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">使用者管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理系統使用者</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          新增使用者
        </button>
      </div>

      {/* Create form */}
      {createOpen && (
        <div className="bg-white rounded-xl border border-amber-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">建立新使用者</h2>
            <button onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">使用者名稱</label>
                <input
                  value={form.username}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-admin"
                checked={form.is_admin}
                onChange={e => setForm(p => ({ ...p, is_admin: e.target.checked }))}
                className="w-4 h-4 rounded text-amber-500"
              />
              <label htmlFor="is-admin" className="text-sm text-gray-700">管理員權限</label>
            </div>
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.username || !form.password}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              建立使用者
            </button>
            {createMutation.isError && (
              <p className="text-sm text-red-500">
                {(createMutation.error as {response?: {data?: {detail?: string}}})?.response?.data?.detail ?? '建立失敗'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* User list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-amber-500 mr-2" />
            <span className="text-gray-500">載入中...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users size={40} className="mb-3 opacity-30" />
            <p className="text-sm">暫無使用者資料</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
              <div className="grid grid-cols-4 text-xs font-medium text-gray-500">
                <span>使用者名稱</span>
                <span>角色</span>
                <span>Key 數量</span>
                <span>建立時間</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {(users as User[]).map((u, i) => (
                <div key={u.id ?? i} className="px-5 py-3 grid grid-cols-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                      <span className="text-amber-700 text-xs font-semibold">{u.username?.[0]?.toUpperCase()}</span>
                    </div>
                    <span className="font-medium text-gray-800">{u.username}</span>
                  </div>
                  <div>
                    {u.is_admin ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">管理員</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">一般用戶</span>
                    )}
                  </div>
                  <div className="text-gray-600">{u.key_count ?? '-'}</div>
                  <div className="text-gray-400 text-xs">{u.created_at ? new Date(u.created_at).toLocaleDateString('zh-TW') : '-'}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

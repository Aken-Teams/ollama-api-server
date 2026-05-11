import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchKeys, createKey, updateKey, deleteKey, regenerateKey, updatePermissions
} from '@/api/keys'
import type { ApiKey } from '@/api/keys'
import { fetchModels } from '@/api/models'
import { useAuthStore } from '@/store/authStore'
import { formatDate } from '@/lib/utils'
import {
  Plus, ChevronDown, ChevronRight, Pencil, Trash2,
  CreditCard, Power, PowerOff, Copy, Check, Loader2, X, Eye
} from 'lucide-react'
import OnboardCardModal from '@/components/OnboardCardModal'

interface CreateForm {
  username: string
  description: string
  selectedModels: string[]
}

export default function KeysPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>({
    username: user?.username ?? '',
    description: '',
    selectedModels: [],
  })
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [newKeyId, setNewKeyId] = useState<number | null>(null)
  const [newKeyModels, setNewKeyModels] = useState<string[]>([])
  const [cardOpen, setCardOpen] = useState(false)
  const [cardApiKey, setCardApiKey] = useState<string | undefined>(undefined)
  const [cardKeyId, setCardKeyId] = useState<number | undefined>(undefined)
  const [cardModels, setCardModels] = useState<string[]>([])
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editModels, setEditModels] = useState<string[] | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [regenKeys, setRegenKeys] = useState<Record<number, string>>({})

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['keys'],
    queryFn: fetchKeys,
  })

  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
  })

  const allModelIds = models.map(m => m.id)

  const createMutation = useMutation({
    mutationFn: createKey,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['keys'] })
      setNewApiKey(data.api_key)
      setNewKeyId(data.key?.id ?? null)
      setNewKeyModels(createForm.selectedModels)
      setCreateOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, username, models }: { id: number; data: Partial<ApiKey>; username: string; models: string[] | null }) => {
      await updateKey(id, data)
      await updatePermissions(username, models)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] })
      setEditingKey(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keys'] }),
  })

  const regenMutation = useMutation({
    mutationFn: regenerateKey,
    onSuccess: (data, id) => {
      qc.invalidateQueries({ queryKey: ['keys'] })
      setRegenKeys(prev => ({ ...prev, [id]: data.api_key }))
    },
  })

  // Group by username
  const grouped: Record<string, ApiKey[]> = {}
  for (const k of keys) {
    if (!grouped[k.username]) grouped[k.username] = []
    grouped[k.username].push(k)
  }

  const copyKey = (id: number, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDelete = (key: ApiKey) => {
    if (confirm(`確定要刪除 Key「${key.api_key_prefix}...」嗎？`)) {
      deleteMutation.mutate(key.id)
    }
  }

  const handleRegen = (key: ApiKey) => {
    if (confirm(`確定要重新產生 Key「${key.api_key_prefix}...」嗎？舊的 Key 將立即失效！`)) {
      regenMutation.mutate(key.id)
    }
  }

  const openCard = (keyId: number, models: string[], fullKey?: string) => {
    setCardKeyId(fullKey ? undefined : keyId)
    setCardApiKey(fullKey)
    setCardModels(models.length > 0 ? models : allModelIds)
    setCardOpen(true)
  }

  const toggleModel = (m: string) => {
    setCreateForm(prev => ({
      ...prev,
      selectedModels: prev.selectedModels.includes(m)
        ? prev.selectedModels.filter(x => x !== m)
        : [...prev.selectedModels, m],
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">API Key 管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理所有使用者的 API Key</p>
        </div>
        <button
          onClick={() => {
            setCreateOpen(true)
            setCreateForm({ username: user?.username ?? '', description: '', selectedModels: [] })
            setNewApiKey(null)
          }}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus size={16} />
          新增 Key
        </button>
      </div>

      {/* Create form */}
      {createOpen && (
        <div className="bg-white rounded-xl border border-amber-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-800">建立新 API Key</h2>
            <button onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">使用者名稱</label>
                <input
                  value={createForm.username}
                  onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))}
                  readOnly={!user?.is_admin}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">說明</label>
                <input
                  value={createForm.description}
                  onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="例：開發測試用途"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">可用模型（說明卡用）</label>
              <div className="flex flex-wrap gap-2">
                {allModelIds.map(m => (
                  <button
                    key={m}
                    onClick={() => toggleModel(m)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      createForm.selectedModels.includes(m)
                        ? 'bg-amber-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => createMutation.mutate({
                username: createForm.username,
                description: createForm.description,
              })}
              disabled={createMutation.isPending || !createForm.username}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              建立 Key
            </button>
          </div>
        </div>
      )}

      {/* New key display */}
      {newApiKey && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-emerald-700">Key 建立成功！</h3>
            <button onClick={() => setNewApiKey(null)} className="text-emerald-500 hover:text-emerald-700">
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <code className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-800 overflow-auto">
              {newApiKey}
            </code>
            <button
              onClick={() => copyKey(-1, newApiKey)}
              className="text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded-lg px-3 py-2"
            >
              {copiedId === -1 ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-xs text-emerald-600 mb-3">請立即複製此 Key，關閉後將無法再次查看完整 Key。</p>
          <button
            onClick={() => newKeyId && openCard(newKeyId, newKeyModels, newApiKey ?? undefined)}
            className="flex items-center gap-2 text-sm bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-lg transition"
          >
            <CreditCard size={14} />
            查看說明卡
          </button>
        </div>
      )}

      {/* Key tree */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-amber-500 mr-2" />
          <span className="text-gray-500">載入中...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([username, userKeys]) => {
            const totalUsage = userKeys.reduce((sum, k) => sum + k.request_count, 0)
            const isCollapsed = collapsed[username]

            return (
              <div key={username} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* User header */}
                <button
                  onClick={() => setCollapsed(prev => ({ ...prev, [username]: !isCollapsed }))}
                  className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 transition text-left"
                >
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <span className="text-amber-700 font-semibold text-sm">{username[0]?.toUpperCase()}</span>
                  </div>
                  <span className="font-semibold text-gray-800">{username}</span>
                  <span className="text-xs text-gray-400 ml-2">{userKeys.length} 個 Key</span>
                  <span className="text-xs text-gray-400 ml-auto">總使用 {totalUsage} 次</span>
                </button>

                {/* Keys */}
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100">
                    {userKeys.map(key => {
                      const isRegen = regenMutation.isPending && regenMutation.variables === key.id
                      const regenResult = regenKeys[key.id]

                      return (
                        <div key={key.id} className="px-5 py-4">
                          {editingKey?.id === key.id ? (
                            // Edit mode
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <input
                                  value={editDesc}
                                  onChange={e => setEditDesc(e.target.value)}
                                  placeholder="說明"
                                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                />
                                <button
                                  onClick={() => updateMutation.mutate({ id: key.id, data: { description: editDesc }, username: key.username, models: editModels })}
                                  disabled={updateMutation.isPending}
                                  className="text-sm bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
                                >
                                  儲存
                                </button>
                                <button onClick={() => setEditingKey(null)} className="text-gray-400 hover:text-gray-600">
                                  <X size={16} />
                                </button>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1.5">
                                  可用模型
                                  <button
                                    className={`ml-2 px-2 py-0.5 rounded-full text-xs border transition ${editModels === null ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'}`}
                                    onClick={() => setEditModels(null)}
                                  >
                                    全部
                                  </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {allModelIds.map(m => {
                                    const selected = editModels !== null && editModels.includes(m)
                                    return (
                                      <button
                                        key={m}
                                        onClick={() => {
                                          if (editModels === null) {
                                            setEditModels(allModelIds.filter(x => x !== m))
                                          } else {
                                            setEditModels(prev => prev!.includes(m) ? prev!.filter(x => x !== m) : [...prev!, m])
                                          }
                                        }}
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition border ${
                                          editModels === null
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : selected
                                            ? 'bg-amber-500 text-white border-amber-500'
                                            : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                                        }`}
                                      >
                                        {m}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <code className="text-sm font-mono text-gray-700">{key.api_key_prefix}...</code>
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    key.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                                  }`}>
                                    {key.is_active ? '活躍' : '停用'}
                                  </span>
                                  {key.is_admin && (
                                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">管理員</span>
                                  )}
                                  <span className="text-xs text-gray-400">{key.request_count} 次</span>
                                </div>
                                {key.description && (
                                  <div className="text-xs text-gray-500 mt-1">{key.description}</div>
                                )}
                                <div className="text-xs text-gray-400 mt-1">
                                  建立：{formatDate(key.created_at)} | 最後使用：{formatDate(key.last_used_at)}
                                </div>
                                {/* Allowed models */}
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {key.allowed_models === null ? (
                                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600 border border-blue-100">
                                      全部模型
                                    </span>
                                  ) : key.allowed_models.length === 0 ? (
                                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-400">
                                      無可用模型
                                    </span>
                                  ) : (
                                    key.allowed_models.map(m => (
                                      <span key={m} className="px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-100">
                                        {m}
                                      </span>
                                    ))
                                  )}
                                </div>

                                {/* Full key (after regenerate) */}
                                {regenResult && (
                                  <div className="mt-2 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs text-emerald-700 font-medium mb-0.5">完整 API Key（請立即複製）</div>
                                      <code className="text-xs font-mono text-emerald-900 break-all">{regenResult}</code>
                                    </div>
                                    <button onClick={() => copyKey(key.id, regenResult)} className="shrink-0">
                                      {copiedId === key.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} className="text-emerald-600" />}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                <ActionBtn
                                  onClick={() => { setEditingKey(key); setEditDesc(key.description); setEditModels(key.allowed_models) }}
                                  title="編輯"
                                  icon={<Pencil size={14} />}
                                />
                                <ActionBtn
                                  onClick={() => updateMutation.mutate({ id: key.id, data: { is_active: !key.is_active }, username: key.username, models: key.allowed_models })}
                                  title={key.is_active ? '停用' : '啟用'}
                                  icon={key.is_active ? <PowerOff size={14} /> : <Power size={14} />}
                                  danger={key.is_active}
                                />
                                <ActionBtn
                                  onClick={() => handleRegen(key)}
                                  title="重新產生 Key（取得完整 Key）"
                                  icon={isRegen ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                                />
                                <ActionBtn
                                  onClick={() => openCard(key.id, key.allowed_models ?? allModelIds, regenResult || undefined)}
                                  title="說明卡"
                                  icon={<CreditCard size={14} />}
                                />
                                <ActionBtn
                                  onClick={() => handleDelete(key)}
                                  title="刪除"
                                  icon={<Trash2 size={14} />}
                                  danger
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <OnboardCardModal
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        prefilledApiKey={cardApiKey}
        prefilledKeyId={cardKeyId}
        prefilledModels={cardModels}
        allModels={allModelIds}
      />
    </div>
  )
}

function ActionBtn({
  onClick, title, icon, danger
}: {
  onClick: () => void
  title: string
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition ${
        danger
          ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
      }`}
    >
      {icon}
    </button>
  )
}

import { useState } from 'react'
import { X, Copy, Check, RefreshCw } from 'lucide-react'
import { buildOnboardCardText } from '@/lib/utils'
import { fetchKeys, regenerateKey } from '@/api/keys'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'

interface Props {
  open: boolean
  onClose: () => void
  prefilledApiKey?: string
  prefilledKeyId?: number
  prefilledModels?: string[]
  allModels: string[]
}

export default function OnboardCardModal({ open, onClose, prefilledApiKey, prefilledKeyId, prefilledModels, allModels }: Props) {
  const { user, apiKey: currentApiKey } = useAuthStore()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'select-user' | 'select-key' | 'show-card'>(
    prefilledApiKey || prefilledKeyId ? 'show-card' : 'select-user'
  )
  const [selectedUsername, setSelectedUsername] = useState('')
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(prefilledKeyId ?? null)
  const [copied, setCopied] = useState(false)
  const [fullApiKey, setFullApiKey] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const { data: keys } = useQuery({
    queryKey: ['keys'],
    queryFn: fetchKeys,
    enabled: (!prefilledApiKey && user?.is_admin === true) || prefilledKeyId != null,
  })

  const uniqueUsers = [...new Set(keys?.map(k => k.username) ?? [])]
  const userKeys = keys?.filter(k => k.username === selectedUsername && k.is_active) ?? []
  const selectedKey = keys?.find(k => k.id === selectedKeyId)

  const handleRegenerate = async () => {
    if (!selectedKey) return
    if (!window.confirm(`重新產生後，舊的 Key 立即失效。確定繼續？`)) return
    setRegenerating(true)
    try {
      const res = await regenerateKey(selectedKey.id)
      setFullApiKey(res.api_key)
      queryClient.invalidateQueries({ queryKey: ['keys'] })
    } catch (e) {
      alert('重新產生失敗')
    } finally {
      setRegenerating(false)
    }
  }

  // Determine final API key to show
  const finalApiKey = prefilledApiKey
    ?? fullApiKey
    ?? (selectedKey ? `${selectedKey.api_key_prefix}...` : currentApiKey ?? '')

  // Per-model policy: each key is locked to a single model. Pick it from
  // (in priority): prefilledModels[0] -> selectedKey.allowed_models[0] -> allModels[0].
  const currentModel =
    (prefilledModels && prefilledModels[0]) ||
    (selectedKey?.allowed_models && selectedKey.allowed_models[0]) ||
    allModels[0] ||
    'gemma4:latest'

  const cardText = buildOnboardCardText(finalApiKey, currentModel)

  const handleCopy = () => {
    navigator.clipboard.writeText(cardText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">說明卡</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: Select user (admin only, no prefilled key) */}
          {!prefilledApiKey && step === 'select-user' && user?.is_admin && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">選擇要產生說明卡的使用者：</p>
              <div className="space-y-2">
                {uniqueUsers.map(u => (
                  <button
                    key={u}
                    onClick={() => { setSelectedUsername(u); setStep('select-key') }}
                    className="w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-amber-300 hover:bg-amber-50 transition"
                  >
                    <span className="font-medium text-gray-800">{u}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      ({keys?.filter(k => k.username === u && k.is_active).length} 個活躍 Key)
                    </span>
                  </button>
                ))}
                <button
                  onClick={() => { setSelectedUsername(user?.username ?? ''); setStep('select-key') }}
                  className="w-full text-left px-4 py-3 border border-dashed border-gray-200 rounded-xl hover:border-amber-300 text-gray-500 text-sm transition"
                >
                  使用我自己的 Key
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Select key */}
          {!prefilledApiKey && step === 'select-key' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep('select-user')}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  &larr; 返回
                </button>
                <p className="text-sm text-gray-600">選擇 {selectedUsername} 的 Key：</p>
              </div>
              {userKeys.length === 0 ? (
                <p className="text-sm text-gray-400">此使用者沒有活躍的 Key</p>
              ) : (
                <div className="space-y-2">
                  {userKeys.map(k => (
                    <button
                      key={k.id}
                      onClick={() => { setSelectedKeyId(k.id); setStep('show-card') }}
                      className="w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-amber-300 hover:bg-amber-50 transition"
                    >
                      <div className="font-mono text-sm text-gray-800">{k.api_key_prefix}...</div>
                      <div className="text-xs text-gray-500 mt-1">{k.description || '無說明'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Show card */}
          {(prefilledApiKey || step === 'show-card') && (
            <div className="space-y-4">
              {/* Full key retrieval (existing key only) */}
              {!prefilledApiKey && selectedKey && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-amber-800 mb-0.5">API Key</div>
                    {fullApiKey ? (
                      <div className="font-mono text-sm text-gray-900 break-all">{fullApiKey}</div>
                    ) : (
                      <div className="font-mono text-sm text-gray-500">{selectedKey.api_key_prefix}… (前綴)</div>
                    )}
                  </div>
                  {!fullApiKey && (
                    <button
                      onClick={handleRegenerate}
                      disabled={regenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition whitespace-nowrap disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />
                      重新產生取得完整 Key
                    </button>
                  )}
                </div>
              )}

              {/* 目前綁定的模型（一把 Key 對應一個模型） */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">使用模型：</p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-medium">
                  {currentModel}
                </div>
              </div>

              {/* Card preview */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono overflow-auto max-h-96">
                  {cardText}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(prefilledApiKey || step === 'show-card') && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? '已複製！' : '複製說明卡'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

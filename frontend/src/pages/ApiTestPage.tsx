import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchModels } from '@/api/models'
import type { Model } from '@/api/models'
import { useAuthStore } from '@/store/authStore'
import { getModelProvider, MODEL_DESCRIPTIONS } from '@/lib/utils'
import { FlaskConical, CreditCard, CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight, Star, Square } from 'lucide-react'
import OnboardCardModal from '@/components/OnboardCardModal'

interface TestResult {
  content: string
  duration: number
  error?: boolean
  streaming?: boolean
}

const PROVIDER_COLORS: Record<string, string> = {
  DeepSeek: 'bg-blue-100 text-blue-700',
  MLX: 'bg-purple-100 text-purple-700',
  Ollama: 'bg-emerald-100 text-emerald-700',
  'llama.cpp': 'bg-orange-100 text-orange-700',
  Router: 'bg-gray-100 text-gray-700',
}

export default function ApiTestPage() {
  const { apiKey } = useAuthStore()
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(() => {
    try { return JSON.parse(localStorage.getItem('model-test-results') || '{}') } catch { return {} }
  })
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [cardOpen, setCardOpen] = useState(false)
  const [cardModelId, setCardModelId] = useState<string>('')
  const abortRef = useRef(false)
  const currentAbortController = useRef<AbortController | null>(null)

  const { data: models = [], isLoading, error } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
  })

  const grouped: Record<string, Model[]> = {}
  for (const m of models) {
    const prov = getModelProvider(m.id)
    if (!grouped[prov]) grouped[prov] = []
    grouped[prov].push(m)
  }

  const allModelIds = models.map(m => m.id)

  const handleTest = async (modelId: string, isRetry = false) => {
    setTesting(prev => ({ ...prev, [modelId]: true }))
    setTestResults(prev => ({ ...prev, [modelId]: { content: '', duration: 0, streaming: true } }))
    const start = Date.now()
    try {
      const { apiKey } = useAuthStore.getState()
      const controller = new AbortController()
      currentAbortController.current = controller
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'X-No-Log': '1' },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: 'Reply in one sentence only. No thinking, no reasoning steps.' },
            { role: 'user', content: '你好，請用一句話自我介紹' },
          ],
          max_tokens: 150,
          stream: true,
          think: false,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const chunk = JSON.parse(data).choices?.[0]?.delta
            const token = chunk?.content || chunk?.reasoning_content || chunk?.reasoning || ''
            if (token) {
              accumulated += token
              setTestResults(prev => ({ ...prev, [modelId]: { content: accumulated, duration: Date.now() - start, streaming: true } }))
            }
          } catch { /* skip */ }
        }
      }
      const finalContent = accumulated || '(無回應)'
      setTestResults(prev => {
        const next = { ...prev, [modelId]: { content: finalContent, duration: Date.now() - start } }
        try { localStorage.setItem('model-test-results', JSON.stringify(next)) } catch {}
        return next
      })
      // auto-retry once if no response
      if (!isRetry && finalContent === '(無回應)' && !abortRef.current) {
        await handleTest(modelId, true)
        return
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      const msg = e instanceof Error ? e.message : '測試失敗'
      setTestResults(prev => {
        const next = { ...prev, [modelId]: { content: msg, duration: Date.now() - start, error: true } }
        try { localStorage.setItem('model-test-results', JSON.stringify(next)) } catch {}
        return next
      })
    } finally {
      setTesting(prev => ({ ...prev, [modelId]: false }))
    }
  }

  const handleTestAll = async () => {
    abortRef.current = false
    for (const m of models) {
      if (abortRef.current) break
      await handleTest(m.id)
    }
  }

  const handleAbort = () => {
    abortRef.current = true
    currentAbortController.current?.abort()
    setTesting({})
  }

  const handleShowCard = (modelId: string) => {
    setCardModelId(modelId)
    setCardOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-amber-500" />
        <span className="ml-3 text-gray-500">載入模型列表...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <XCircle size={32} className="text-red-500 mx-auto mb-2" />
        <p className="text-red-600">無法載入模型列表，請確認服務是否正常運行</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">模型快速測試</h1>
          <p className="text-sm text-gray-500 mt-1">
            對每個模型發送「你好，請用一句話自我介紹」並測量回應速度
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">共 {models.length} 個模型</span>
          {Object.values(testing).some(Boolean) ? (
            <button
              onClick={handleAbort}
              className="flex items-center gap-1.5 text-sm bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg transition"
            >
              <Square size={12} className="fill-white" />
              終止測試
            </button>
          ) : (
            <button
              onClick={handleTestAll}
              className="flex items-center gap-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg transition"
            >
              <FlaskConical size={14} />
              全部測試
            </button>
          )}
        </div>
      </div>

      {/* Test status bar */}
      {(() => {
        const total = models.length
        const tested = Object.keys(testResults).length
        const passed = Object.values(testResults).filter(r => !r.error && !r.streaming).length
        const failed = Object.values(testResults).filter(r => r.error).length
        const isBusy = Object.values(testing).some(Boolean)
        const currentModel = Object.entries(testing).find(([, v]) => v)?.[0]
        if (total === 0) return null
        return (
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-4 text-sm">
              {isBusy ? (
                <>
                  <Loader2 size={14} className="animate-spin text-amber-500 shrink-0" />
                  <span className="text-gray-500 truncate">正在測試：<span className="font-mono text-gray-700">{currentModel}</span></span>
                  <span className="ml-auto text-gray-400 shrink-0">{tested} / {total}</span>
                </>
              ) : tested === 0 ? (
                <span className="text-gray-400">點擊「全部測試」或個別模型的測試按鈕</span>
              ) : (
                <>
                  <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                  <span className="text-gray-600">測試完成</span>
                  <span className="text-emerald-600 font-medium">{passed} 成功</span>
                  {failed > 0 && <span className="text-red-500 font-medium">{failed} 失敗</span>}
                  <span className="ml-auto text-gray-400 shrink-0">{tested} / {total} 已測</span>
                </>
              )}
            </div>
            {(isBusy || tested > 0) && (
              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(tested / total) * 100}%`,
                    background: failed > 0 && !isBusy
                      ? 'linear-gradient(to right, #10b981, #ef4444)'
                      : '#f59e0b',
                  }}
                />
              </div>
            )}
          </div>
        )
      })()}

      {/* Model groups */}
      {Object.entries(grouped).map(([provider, provModels]) => {
        const isCollapsed = collapsed[provider]
        return (
          <div key={provider} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Provider header */}
            <button
              onClick={() => setCollapsed(prev => ({ ...prev, [provider]: !isCollapsed }))}
              className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 hover:bg-gray-100 transition text-left"
            >
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PROVIDER_COLORS[provider] ?? 'bg-gray-100 text-gray-700'}`}>
                {provider}
              </span>
              <span className="font-semibold text-gray-700">{provider}</span>
              <span className="text-sm text-gray-400 ml-auto">{provModels.length} 個模型</span>
            </button>

            {/* Model rows */}
            {!isCollapsed && (
              <div className="divide-y divide-gray-100">
                {provModels.map(model => {
                  const result = testResults[model.id]
                  const isTesting = testing[model.id]
                  const desc = MODEL_DESCRIPTIONS[model.id] ?? '無說明'

                  return (
                    <div key={model.id} className="px-5 py-4">
                      <div className="flex items-start gap-4">
                        {/* Model info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-medium text-gray-800">{model.id}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${PROVIDER_COLORS[provider] ?? 'bg-gray-100 text-gray-600'}`}>
                              {provider}
                            </span>
                            {result && !result.error && !result.streaming && (
                              <>
                                <span className="flex items-center gap-1 text-xs text-emerald-600">
                                  <CheckCircle size={12} />
                                  {result.duration >= 1000 ? `${(result.duration / 1000).toFixed(1)}s` : `${result.duration}ms`}
                                </span>
                                <span className="flex items-center gap-0.5">
                                  {Array.from({ length: 5 }, (_, i) => {
                                    const stars = result.duration < 3000 ? 5 : result.duration < 8000 ? 4 : result.duration < 20000 ? 3 : result.duration < 60000 ? 2 : 1
                                    return <Star key={i} size={11} className={i < stars ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'} />
                                  })}
                                </span>
                              </>
                            )}
                            {result?.streaming && (
                              <span className="text-xs text-amber-500">回應中…</span>
                            )}
                            {result?.error && (
                              <span className="flex items-center gap-1 text-xs text-red-500">
                                <XCircle size={12} />
                                錯誤
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{desc}</p>

                          {/* Test result */}
                          {result && (
                            <div className={`mt-2 text-sm rounded-lg px-3 py-2 leading-relaxed ${
                              result.error
                                ? 'bg-red-50 text-red-600 border border-red-100'
                                : 'bg-emerald-50 text-gray-800 border border-emerald-100'
                            }`}>
                              {result.content || <span className="text-gray-300">等待回應…</span>}
                              {result.streaming && <span className="inline-block w-0.5 h-3.5 bg-amber-400 ml-0.5 animate-pulse align-middle" />}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleTest(model.id)}
                            disabled={isTesting}
                            className="flex items-center gap-1.5 text-sm bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                          >
                            {isTesting ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                            {isTesting ? '測試中...' : '測試'}
                          </button>
                          <button
                            onClick={() => handleShowCard(model.id)}
                            className="flex items-center gap-1.5 text-sm border border-gray-200 hover:border-violet-300 hover:text-violet-600 text-gray-600 px-3 py-1.5 rounded-lg transition"
                          >
                            <CreditCard size={14} />
                            說明卡
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Onboard card modal */}
      <OnboardCardModal
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        prefilledApiKey={apiKey ?? ''}
        prefilledModels={cardModelId ? [cardModelId] : undefined}
        allModels={allModelIds}
      />
    </div>
  )
}

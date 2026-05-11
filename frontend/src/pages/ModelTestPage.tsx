import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchModels } from '@/api/models'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import { Play, Download, Loader2, Image as ImageIcon } from 'lucide-react'
import { MODEL_DESCRIPTIONS } from '@/lib/utils'

interface BenchResult {
  model: string
  ttft: number
  totalTime: number
  tokensPerSec: number
  content: string
  error?: boolean
}

const PROMPT_PRESETS = [
  { label: '自我介紹', value: '你好，請用三句話自我介紹' },
  { label: '程式題', value: '請用 Python 寫一個快速排序演算法，並加上中文說明' },
  { label: '翻譯', value: '請將以下文字翻譯成英文：人工智慧正在改變世界，讓我們一起迎接未來' },
  { label: '推理題', value: '如果今天是星期三，那麼 100 天後是星期幾？請一步步推理' },
  { label: '創意寫作', value: '請寫一首關於春天的五言絕句' },
]

export default function ModelTestPage() {
  const { data: models = [] } = useQuery({ queryKey: ['models'], queryFn: fetchModels })
  const { apiKey } = useAuthStore()

  // Section 1: Benchmark
  const [benchPrompt, setBenchPrompt] = useState(PROMPT_PRESETS[0].value)
  const [benchModels, setBenchModels] = useState<string[]>([])
  const [maxTokens, setMaxTokens] = useState(200)
  const [repeatCount, setRepeatCount] = useState(1)
  const [benchResults, setBenchResults] = useState<BenchResult[]>([])
  const [benchRunning, setBenchRunning] = useState(false)

  // Section 3: Chat test
  const [chatModel, setChatModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [userMessage, setUserMessage] = useState('')
  const [streamMode, setStreamMode] = useState(true)
  const [chatResponse, setChatResponse] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [imageBase64, setImageBase64] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleBenchModel = (id: string) => {
    setBenchModels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const runBenchmark = async () => {
    if (benchModels.length === 0) return
    setBenchRunning(true)
    setBenchResults([])

    const runOne = async (modelId: string): Promise<BenchResult> => {
      const start = Date.now()
      let ttft = 0
      try {
        const res = await apiClient.post('/v1/chat/completions', {
          model: modelId,
          messages: [{ role: 'user', content: benchPrompt }],
          max_tokens: maxTokens,
        })
        const totalTime = Date.now() - start
        ttft = totalTime // non-streaming: same as total
        const content = res.data?.choices?.[0]?.message?.content ?? ''
        const tokens = res.data?.usage?.completion_tokens ?? Math.ceil(content.length / 3)
        const tokensPerSec = tokens / (totalTime / 1000)
        return { model: modelId, ttft, totalTime, tokensPerSec, content }
      } catch (e: unknown) {
        const err = e as { message?: string }
        return { model: modelId, ttft: 0, totalTime: Date.now() - start, tokensPerSec: 0, content: err.message ?? '錯誤', error: true }
      }
    }

    const allRuns: BenchResult[] = []
    for (let r = 0; r < repeatCount; r++) {
      const results = await Promise.all(benchModels.map(runOne))
      allRuns.push(...results)
    }

    // Average if repeat > 1
    const averaged: Record<string, BenchResult> = {}
    for (const r of allRuns) {
      if (!averaged[r.model]) {
        averaged[r.model] = { ...r }
      } else {
        averaged[r.model].ttft = (averaged[r.model].ttft + r.ttft) / 2
        averaged[r.model].totalTime = (averaged[r.model].totalTime + r.totalTime) / 2
        averaged[r.model].tokensPerSec = (averaged[r.model].tokensPerSec + r.tokensPerSec) / 2
      }
    }

    const sorted = Object.values(averaged).sort((a, b) => a.totalTime - b.totalTime)
    setBenchResults(sorted)
    setBenchRunning(false)
  }

  const exportCSV = () => {
    const header = 'Model,TTFT(ms),TotalTime(ms),Tokens/s,Error'
    const rows = benchResults.map(r =>
      `"${r.model}",${Math.round(r.ttft)},${Math.round(r.totalTime)},${r.tokensPerSec.toFixed(1)},${r.error ? 'yes' : 'no'}`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'benchmark.csv'
    a.click()
  }

  const exportMarkdown = () => {
    const header = '| 名次 | 模型 | 總時間(ms) | Tokens/s | 狀態 |'
    const sep = '|---|---|---|---|---|'
    const rows = benchResults.map((r, i) =>
      `| ${i + 1} | ${r.model} | ${Math.round(r.totalTime)} | ${r.tokensPerSec.toFixed(1)} | ${r.error ? '錯誤' : '成功'} |`
    )
    const md = [header, sep, ...rows].join('\n')
    navigator.clipboard.writeText(md)
    alert('Markdown 已複製到剪貼簿')
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImageBase64(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleChat = async () => {
    if (!userMessage || !chatModel) return
    setChatLoading(true)
    setChatResponse('')

    const messages: Array<{role: string; content: unknown}> = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })

    if (imageBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userMessage },
          { type: 'image_url', image_url: { url: imageBase64 } }
        ]
      })
    } else {
      messages.push({ role: 'user', content: userMessage })
    }

    try {
      if (streamMode) {
        const response = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model: chatModel, messages, stream: true }),
        })

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let text = ''

        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content ?? ''
              text += delta
              setChatResponse(text)
            } catch { /* ignore parse errors */ }
          }
        }
      } else {
        const res = await apiClient.post('/v1/chat/completions', {
          model: chatModel, messages
        })
        setChatResponse(res.data?.choices?.[0]?.message?.content ?? '(無回應)')
      }
    } catch (e: unknown) {
      const err = e as { message?: string }
      setChatResponse(`錯誤：${err.message}`)
    } finally {
      setChatLoading(false)
    }
  }

  const podiumEmojis = ['🥇', '🥈', '🥉']

  const selectedChatModelInfo = models.find(m => m.id === chatModel)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">效能比較 & 模型測試</h1>

      {/* Section 1: Benchmark */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">1. 效能比較 Benchmark</h2>

        <div className="space-y-4">
          {/* Prompt presets */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prompt 預設</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              onChange={e => setBenchPrompt(e.target.value)}
            >
              {PROMPT_PRESETS.map(p => (
                <option key={p.label} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Prompt textarea */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">測試 Prompt</label>
            <textarea
              value={benchPrompt}
              onChange={e => setBenchPrompt(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {/* Settings row */}
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
                min={50} max={2000}
                className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">重複次數</label>
              <input
                type="number"
                value={repeatCount}
                onChange={e => setRepeatCount(Number(e.target.value))}
                min={1} max={5}
                className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Model checkboxes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">選擇模型（可多選）</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {models.map(m => (
                <label key={m.id} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={benchModels.includes(m.id)}
                    onChange={() => toggleBenchModel(m.id)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400"
                  />
                  <span className="text-sm text-gray-700 truncate group-hover:text-amber-600 transition-colors">
                    {m.id}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={runBenchmark}
            disabled={benchRunning || benchModels.length === 0}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {benchRunning ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {benchRunning ? '測試中...' : '執行 Benchmark'}
          </button>
        </div>

        {/* Results */}
        {benchResults.length > 0 && (
          <div className="mt-6">
            {/* Podium */}
            <div className="flex items-end justify-center gap-4 mb-6">
              {benchResults.slice(0, 3).map((r, i) => (
                <div key={r.model} className={`text-center ${i === 0 ? 'order-2' : i === 1 ? 'order-1' : 'order-3'}`}>
                  <div className="text-2xl mb-1">{podiumEmojis[i]}</div>
                  <div className={`rounded-t-lg px-4 py-2 text-white text-sm ${
                    i === 0 ? 'bg-amber-500 h-20 pt-6' : i === 1 ? 'bg-gray-400 h-14 pt-2' : 'bg-amber-700 h-10 pt-0'
                  }`}>
                    {Math.round(r.totalTime)}ms
                  </div>
                  <div className="bg-gray-100 px-2 py-1 text-xs text-gray-600 truncate max-w-[100px]">{r.model}</div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th className="px-4 py-2 text-left">名次</th>
                    <th className="px-4 py-2 text-left">模型</th>
                    <th className="px-4 py-2 text-right">總時間</th>
                    <th className="px-4 py-2 text-right">Tokens/s</th>
                    <th className="px-4 py-2 text-left">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {benchResults.map((r, i) => (
                    <tr key={r.model} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">{podiumEmojis[i] ?? i + 1}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.model}</td>
                      <td className="px-4 py-2.5 text-right">{Math.round(r.totalTime)}ms</td>
                      <td className="px-4 py-2.5 text-right">{r.tokensPerSec.toFixed(1)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          r.error ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                        }`}>
                          {r.error ? '錯誤' : '成功'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Export buttons */}
            <div className="flex gap-2 mt-4">
              <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm border border-gray-200 hover:border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg transition">
                <Download size={14} />
                CSV
              </button>
              <button onClick={exportMarkdown} className="flex items-center gap-1.5 text-sm border border-gray-200 hover:border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg transition">
                <Download size={14} />
                Markdown
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: List models */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">2. 列出可用模型</h2>
        <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
          <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap">
            {JSON.stringify({ data: models }, null, 2)}
          </pre>
        </div>
      </div>

      {/* Section 3: Chat completion test */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">3. 聊天完成測試</h2>

        <div className="space-y-4">
          {/* Model select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">選擇模型</label>
            <select
              value={chatModel}
              onChange={e => setChatModel(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">-- 選擇模型 --</option>
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.id}</option>
              ))}
            </select>
            {selectedChatModelInfo && (
              <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                {MODEL_DESCRIPTIONS[selectedChatModelInfo.id] ?? selectedChatModelInfo.id}
              </div>
            )}
          </div>

          {/* System prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt（可選）</label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={2}
              placeholder="你是一個有幫助的 AI 助理..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {/* User message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User Message</label>
            <textarea
              value={userMessage}
              onChange={e => setUserMessage(e.target.value)}
              rows={3}
              placeholder="輸入您的訊息..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">上傳圖片（視覺模型）</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-sm border border-gray-200 hover:border-amber-300 text-gray-600 px-3 py-2 rounded-lg transition"
              >
                <ImageIcon size={14} />
                選擇圖片
              </button>
              {imageBase64 && (
                <div className="flex items-center gap-2">
                  <img src={imageBase64} alt="preview" className="w-12 h-12 object-cover rounded-lg" />
                  <button onClick={() => setImageBase64('')} className="text-xs text-red-500">移除</button>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          {/* Options */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="stream-mode"
              checked={streamMode}
              onChange={e => setStreamMode(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500"
            />
            <label htmlFor="stream-mode" className="text-sm text-gray-700">串流模式（Streaming）</label>
          </div>

          <button
            onClick={handleChat}
            disabled={chatLoading || !chatModel || !userMessage}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium px-5 py-2.5 rounded-lg transition disabled:opacity-50"
          >
            {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {chatLoading ? '回應中...' : '發送'}
          </button>

          {/* Response */}
          {chatResponse && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-400 mb-2">回應：</div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{chatResponse}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

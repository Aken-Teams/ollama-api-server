import { useState, useRef, useEffect } from 'react'
import {
  FileImage, Upload, FileText, Download, Loader2,
  CheckCircle, XCircle, RotateCw, AlertTriangle,
  Key, Copy, Check, X,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { EXTERNAL_BASE_URL } from '@/lib/utils'

function buildOcrOnboardPrompt(apiKey: string, model: string): string {
  return `# 私有 OCR API 存取資訊（OpenAI-style gateway，自架）

請用以下資訊幫我寫程式呼叫 OCR API 完成接下來的任務。
此 endpoint 流程是 **submit → poll → result**（非同步 job 模式）。

## 連線設定

\`\`\`python
BASE_URL = "${EXTERNAL_BASE_URL}/v1"
API_KEY  = "${apiKey}"
MODEL    = "${model}"
\`\`\`

## 重要限制（請務必遵守）

1. 這把 API Key **只能呼叫 OCR 模型 \`${model}\`**。其他模型 ID、其他 feature（例如 chat completions）一律會被 gateway 擋掉（400 或 403）。不要嘗試列表以外的模型。
2. 上傳檔案限制：**單檔 ≤ 20 MB**；支援圖片（jpg/png/webp/...）或 PDF。
3. submit 後 **必須輪詢** \`GET /v1/ocr/jobs/{job_id}\` 直到 \`status\` 變成 \`"done"\` 或 \`"error"\`。建議間隔 1 秒，可以加上 timeout（例如 5 分鐘）防止卡死。
4. \`status\` 可能的值：\`queued\` / \`rendering\` / \`processing\` / \`done\` / \`error\`。只有 \`done\` / \`error\` 是 terminal state。

## API 端點

- \`POST /v1/ocr/submit\`  multipart form：\`file\`(必填)、\`model\`(必填)、\`language=auto\` → 回 \`{"job_id": "..."}\`
- \`GET  /v1/ocr/jobs/{job_id}\`  → 回 \`{status, total_pages, completed_pages, pages:[{page,text,confidence}], full_text, total_chars, confidence, error}\`

## Python 範例（純標準庫 urllib，**不必裝任何套件**）

\`\`\`python
import json, time, mimetypes, secrets, urllib.request
from pathlib import Path

BASE_URL = "${EXTERNAL_BASE_URL}/v1"
API_KEY  = "${apiKey}"
MODEL    = "${model}"

def submit(path: str) -> str:
    boundary = "----" + secrets.token_hex(16)
    ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
    fname = Path(path).name
    file_bytes = Path(path).read_bytes()
    body = (
        f'--{boundary}\\r\\n'
        f'Content-Disposition: form-data; name="file"; filename="{fname}"\\r\\n'
        f'Content-Type: {ctype}\\r\\n\\r\\n'
    ).encode() + file_bytes + (
        f'\\r\\n--{boundary}\\r\\n'
        f'Content-Disposition: form-data; name="model"\\r\\n\\r\\n'
        f'{MODEL}\\r\\n'
        f'--{boundary}\\r\\n'
        f'Content-Disposition: form-data; name="language"\\r\\n\\r\\n'
        f'auto\\r\\n'
        f'--{boundary}--\\r\\n'
    ).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/ocr/submit",
        method="POST",
        data=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["job_id"]

def poll(job_id: str, every: float = 1.0, timeout_sec: float = 300) -> dict:
    deadline = time.time() + timeout_sec
    while True:
        req = urllib.request.Request(
            f"{BASE_URL}/ocr/jobs/{job_id}",
            headers={"Authorization": f"Bearer {API_KEY}"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
        if data["status"] in ("done", "error"):
            return data
        if time.time() > deadline:
            raise TimeoutError(f"OCR job {job_id} did not finish in {timeout_sec}s")
        time.sleep(every)

# === 使用 ===
job_id = submit("your_file.pdf")          # 換成你的檔案路徑
result = poll(job_id)
if result["status"] == "error":
    raise RuntimeError(result.get("error") or "OCR failed")
print(result["full_text"])                # 純文字結果
# result["pages"] 是每頁分開的結果：[{page,text,confidence}, ...]
\`\`\`

> 若已裝 \`requests\` 套件可改寫成：
> \`requests.post(f"{BASE_URL}/ocr/submit", headers={"Authorization": f"Bearer {API_KEY}"}, files={"file": open(p,"rb")}, data={"model": MODEL, "language": "auto"}).json()["job_id"]\`
> 不建議用 \`curl\` 直接打：在 PowerShell / cmd.exe 下 \`curl\` 是 \`Invoke-WebRequest\` 別名，會把 multipart 搞壞。
`
}

interface OcrModel {
  id: string
  name: string
  description: string
  features: string[]
  best_for: string
  available: boolean
}

interface OcrJob {
  job_id: string
  status: 'queued' | 'rendering' | 'processing' | 'done' | 'error'
  model: string
  model_name: string
  total_pages: number
  completed_pages: number
  current_page: number
  pages: { page: number; text: string; confidence?: number }[]
  full_text: string
  total_chars: number
  confidence: number
  error: string | null
  started_at: number
  finished_at: number | null
  processing_time_ms?: number
  filename: string
}

const STATUS_LABEL: Record<string, string> = {
  queued: '排隊中',
  rendering: '渲染頁面',
  processing: '辨識中',
  done: '完成',
  error: '錯誤',
}

const STATUS_COLOR: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700 border-gray-200',
  rendering: 'bg-blue-50 text-blue-700 border-blue-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  error: 'bg-red-50 text-red-700 border-red-200',
}

export default function OcrPage() {
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'text' | 'pages' | 'json'>('text')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  // Per-OCR-model API key issuance
  const [requestingKey, setRequestingKey] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [issuedKey, setIssuedKey] = useState<{
    username: string
    model: string
    api_key: string
    rotated: boolean
    note: string
  } | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)

  // Fetch available OCR models on mount
  const { data: modelsResp } = useQuery({
    queryKey: ['ocr', 'models'],
    queryFn: async () => (await apiClient.get<{ models: OcrModel[] }>('/v1/ocr/models')).data,
  })
  const models = modelsResp?.models ?? []

  // Default to first available model once list arrives
  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      const firstAvail = models.find(m => m.available) ?? models[0]
      setSelectedModel(firstAvail.id)
    }
  }, [models, selectedModel])

  // Poll job until done/error
  const { data: job, refetch: refetchJob } = useQuery<OcrJob | null>({
    queryKey: ['ocr', 'job', jobId],
    queryFn: async () => {
      if (!jobId) return null
      const r = await apiClient.get<OcrJob>(`/v1/ocr/jobs/${jobId}`)
      return r.data
    },
    enabled: !!jobId,
    refetchInterval: (q) => {
      const data = q.state.data as OcrJob | null | undefined
      if (!data) return 1000
      return data.status === 'done' || data.status === 'error' ? false : 800
    },
    refetchIntervalInBackground: false,
  })

  // Image preview if file is image
  useEffect(() => {
    if (!file) { setPreview(null); return }
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setPreview(null)
    }
  }, [file])

  const handleFileChoose = (f: File | null) => {
    setSubmitError(null)
    if (!f) { setFile(null); return }
    if (f.size > 20 * 1024 * 1024) {
      setSubmitError('檔案超過 20 MB 限制')
      return
    }
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setSubmitError('僅支援圖片 (jpg/png/webp/...) 或 PDF')
      return
    }
    setFile(f)
  }

  const handleRequestKey = async () => {
    if (!selectedModel) return
    setRequestingKey(true)
    setKeyError(null)
    try {
      const r = await apiClient.post<{
        username: string
        model: string
        api_key: string
        rotated: boolean
        note: string
      }>('/v1/ocr/request-key', { model: selectedModel })
      setIssuedKey(r.data)
      setKeyCopied(false)
    } catch (e: any) {
      setKeyError(e?.response?.data?.detail || e?.message || '申請失敗')
    } finally {
      setRequestingKey(false)
    }
  }

  const handleCopyKey = async () => {
    if (!issuedKey) return
    try {
      await navigator.clipboard.writeText(issuedKey.api_key)
      setKeyCopied(true)
      setTimeout(() => setKeyCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleCopyPrompt = async () => {
    if (!issuedKey) return
    try {
      await navigator.clipboard.writeText(buildOcrOnboardPrompt(issuedKey.api_key, issuedKey.model))
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleSubmit = async () => {
    if (!file || !selectedModel) return
    setSubmitting(true)
    setSubmitError(null)
    setJobId(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('model', selectedModel)
      form.append('language', 'auto')
      const r = await apiClient.post<{ job_id: string }>('/v1/ocr/submit', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      })
      setJobId(r.data.job_id)
    } catch (e: any) {
      setSubmitError(e?.response?.data?.detail || e?.message || '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setPreview(null)
    setJobId(null)
    setSubmitError(null)
    setActiveTab('text')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownload = (kind: 'txt' | 'json' | 'md') => {
    if (!job) return
    let content = ''
    let mime = 'text/plain'
    let ext = 'txt'
    if (kind === 'txt') {
      content = job.full_text || ''
    } else if (kind === 'json') {
      content = JSON.stringify(job, null, 2)
      mime = 'application/json'
      ext = 'json'
    } else {
      // markdown: per-page sections
      const parts = [`# OCR 結果\n\n**模型：** ${job.model_name}\n**檔案：** ${job.filename}\n**頁數：** ${job.total_pages}\n**字元：** ${job.total_chars}\n`]
      job.pages.forEach(p => {
        parts.push(`\n## Page ${p.page}\n\n${p.text}\n`)
      })
      content = parts.join('')
      mime = 'text/markdown'
      ext = 'md'
    }
    const blob = new Blob([content], { type: mime })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(job.filename || 'ocr').replace(/\.[^.]+$/, '')}.${ext}`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const isProcessing = job && job.status !== 'done' && job.status !== 'error'
  const progressPct = job && job.total_pages > 0 ? Math.round((job.completed_pages / job.total_pages) * 100) : 0
  const elapsedSec = job?.processing_time_ms ? (job.processing_time_ms / 1000).toFixed(2) : '—'

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileImage size={24} className="text-amber-500" />
          OCR 工具 <span className="text-sm font-normal text-gray-400 ml-2">demo</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          上傳圖片或 PDF（≤ 20 MB），選 OCR 模型，回傳純文字結果。本頁直接呼叫 gateway 的 <code className="text-xs bg-gray-100 px-1 rounded">/v1/ocr/*</code> endpoints。
        </p>
      </div>

      {/* Model selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">OCR 模型</label>
        <select
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
          disabled={!!isProcessing || submitting}
        >
          {models.map(m => (
            <option key={m.id} value={m.id} disabled={!m.available}>
              {m.name}{!m.available ? '（離線）' : ''} — {m.best_for}
            </option>
          ))}
        </select>
        {selectedModel && (() => {
          const m = models.find(x => x.id === selectedModel)
          if (!m) return null
          return (
            <div className="mt-2 text-xs text-gray-500">
              <div>{m.description}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {m.features.map(f => (
                  <span key={f} className="px-2 py-0.5 bg-gray-100 rounded text-gray-600">{f}</span>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Request per-model API key */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3 flex-wrap">
          <button
            onClick={handleRequestKey}
            disabled={!selectedModel || requestingKey}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="申請一把僅能呼叫此 OCR 模型的 API Key，可在外部系統使用"
          >
            {requestingKey ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
            {requestingKey ? '申請中…' : '申請此模型的 API Key'}
          </button>
          <span className="text-xs text-gray-400">
            這把 Key 只能呼叫目前選到的 OCR 模型；可用於外部系統 / 自動化。
          </span>
        </div>
        {keyError && (
          <div className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{keyError}</span>
          </div>
        )}
      </div>

      {/* File upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <label className="block text-sm font-semibold text-gray-700 mb-2">上傳檔案</label>
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) handleFileChoose(f)
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
            dragOver ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/30'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            className="hidden"
            onChange={e => handleFileChoose(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="flex items-center gap-3 justify-center text-sm text-gray-700">
              {preview ? (
                <img src={preview} alt="" className="w-16 h-16 object-cover rounded-lg border" />
              ) : (
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                  <FileText size={24} className="text-gray-400" />
                </div>
              )}
              <div className="text-left">
                <div className="font-medium">{file.name}</div>
                <div className="text-xs text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || 'unknown'}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-500">
              <Upload size={28} className="mx-auto mb-2 text-gray-400" />
              <div className="text-sm">點此選擇或拖放檔案</div>
              <div className="text-xs mt-1">圖片或 PDF，≤ 20 MB</div>
            </div>
          )}
        </div>
        {submitError && (
          <div className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!file || !selectedModel || submitting || !!isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <FileImage size={14} />}
            {submitting ? '提交中…' : '開始辨識'}
          </button>
          {(file || job) && (
            <button
              onClick={handleReset}
              disabled={submitting || !!isProcessing}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 hover:border-gray-300 text-gray-600 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              <RotateCw size={14} />
              重設
            </button>
          )}
        </div>
      </div>

      {/* Progress / Result */}
      {job && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {job.status === 'done' && <CheckCircle size={18} className="text-emerald-500" />}
              {job.status === 'error' && <XCircle size={18} className="text-red-500" />}
              {isProcessing && <Loader2 size={18} className="animate-spin text-amber-500" />}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[job.status] ?? STATUS_COLOR.queued}`}>
                {STATUS_LABEL[job.status] ?? job.status}
              </span>
              <span className="text-xs text-gray-500">job: <code className="font-mono">{job.job_id.slice(0, 12)}…</code></span>
              <span className="text-xs text-gray-500">模型: {job.model_name}</span>
            </div>
            <button
              onClick={() => refetchJob()}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <RotateCw size={12} /> 刷新
            </button>
          </div>

          {/* Progress bar */}
          {job.total_pages > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>第 {job.current_page || job.completed_pages} / {job.total_pages} 頁</span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${job.status === 'error' ? 'bg-red-400' : 'bg-amber-400'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {job.status === 'error' && job.error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {job.error}
            </div>
          )}

          {/* Stats */}
          {job.status === 'done' && (
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">處理時間</div>
                <div className="text-lg font-semibold text-gray-800">{elapsedSec}s</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">頁數</div>
                <div className="text-lg font-semibold text-gray-800">{job.total_pages}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">字元數</div>
                <div className="text-lg font-semibold text-gray-800">{job.total_chars.toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-xs text-gray-500">信心度</div>
                <div className="text-lg font-semibold text-gray-800">
                  {job.confidence ? (job.confidence * 100).toFixed(1) + '%' : '—'}
                </div>
              </div>
            </div>
          )}

          {/* Result tabs */}
          {job.status === 'done' && job.full_text && (
            <div>
              <div className="flex gap-1 border-b border-gray-200 mb-3">
                {([
                  ['text', '純文字'],
                  ['pages', `分頁 (${job.total_pages})`],
                  ['json', 'Raw JSON'],
                ] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setActiveTab(k)}
                    className={`px-3 py-1.5 text-sm transition ${
                      activeTab === k
                        ? 'border-b-2 border-amber-500 text-amber-600 font-medium'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <div className="ml-auto flex gap-1 pb-1">
                  <button onClick={() => handleDownload('txt')} className="text-xs px-2 py-1 border border-gray-200 hover:border-gray-300 rounded inline-flex items-center gap-1">
                    <Download size={11} /> .txt
                  </button>
                  <button onClick={() => handleDownload('md')} className="text-xs px-2 py-1 border border-gray-200 hover:border-gray-300 rounded inline-flex items-center gap-1">
                    <Download size={11} /> .md
                  </button>
                  <button onClick={() => handleDownload('json')} className="text-xs px-2 py-1 border border-gray-200 hover:border-gray-300 rounded inline-flex items-center gap-1">
                    <Download size={11} /> .json
                  </button>
                </div>
              </div>

              {activeTab === 'text' && (
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm font-mono whitespace-pre-wrap break-words max-h-[480px] overflow-auto">
                  {job.full_text || '(empty)'}
                </pre>
              )}

              {activeTab === 'pages' && (
                <div className="space-y-3 max-h-[480px] overflow-auto">
                  {job.pages.map(p => (
                    <details key={p.page} className="bg-gray-50 border border-gray-200 rounded-lg" open={job.pages.length <= 3}>
                      <summary className="px-3 py-2 text-sm font-medium cursor-pointer text-gray-700">
                        Page {p.page}{p.confidence ? ` · 信心 ${(p.confidence * 100).toFixed(1)}%` : ''}
                      </summary>
                      <pre className="px-3 pb-3 text-sm font-mono whitespace-pre-wrap break-words text-gray-700">{p.text || '(empty)'}</pre>
                    </details>
                  ))}
                </div>
              )}

              {activeTab === 'json' && (
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono whitespace-pre overflow-auto max-h-[480px]">
                  {JSON.stringify(job, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Issued API Key modal */}
      {issuedKey && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setIssuedKey(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-6 space-y-4 max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Key size={20} className="text-indigo-600" />
                <h2 className="text-lg font-bold text-gray-900">
                  {issuedKey.rotated ? 'API Key 已重新產生' : 'API Key 已建立'}
                </h2>
              </div>
              <button
                onClick={() => setIssuedKey(null)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">完整 Key 只會顯示這一次，請立即複製保存。</div>
                {issuedKey.rotated && (
                  <div className="mt-1 text-amber-700">
                    你先前申請過這個模型的 Key，舊 Key 已被取代並失效。
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-500">綁定模型</div>
              <div className="text-sm font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                {issuedKey.model}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-500">使用者帳號（內部記錄用，不需用到）</div>
              <div className="text-sm font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                {issuedKey.username}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-gray-500">API Key</div>
              <div className="flex items-stretch gap-2">
                <div className="flex-1 text-sm font-mono bg-gray-900 text-emerald-300 rounded px-3 py-2 break-all select-all">
                  {issuedKey.api_key}
                </div>
                <button
                  onClick={handleCopyKey}
                  className={`flex items-center gap-1.5 px-3 rounded text-sm font-medium transition ${
                    keyCopied
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {keyCopied ? <Check size={14} /> : <Copy size={14} />}
                  {keyCopied ? '已複製' : '複製'}
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 leading-relaxed">
              {issuedKey.note}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-gray-700">給 Claude Code / Codex 的完整提示（含 API Key）</div>
                <button
                  onClick={handleCopyPrompt}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition ${
                    promptCopied
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {promptCopied ? <Check size={12} /> : <Copy size={12} />}
                  {promptCopied ? '已複製' : '複製整段提示'}
                </button>
              </div>
              <pre className="bg-gray-50 border border-gray-200 rounded p-2 text-[11px] font-mono leading-relaxed overflow-auto whitespace-pre max-h-64">
{buildOcrOnboardPrompt(issuedKey.api_key, issuedKey.model)}
              </pre>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIssuedKey(null)}
                className="px-4 py-2 border border-gray-200 hover:border-gray-300 text-gray-700 rounded-lg text-sm font-medium transition"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { FileImage } from 'lucide-react'

export default function OcrPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">OCR 工具</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
            <FileImage size={22} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">OCR 圖片文字辨識</h2>
            <p className="text-gray-500 text-sm">
              OCR 透過本 API gateway 暴露的 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">/v1/ocr/*</code> 端點使用，目前沒有內建的 Web UI。
              請用程式呼叫 API（範例見下方）；或聯絡管理員取得對應 OCR 模型的 API Key。
            </p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="text-xs font-semibold text-gray-600 mb-2">可用 OCR endpoints</div>
          <ul className="text-sm text-gray-700 space-y-1 font-mono">
            <li><code className="text-amber-700">GET  /v1/ocr/models</code> — 列出可用 OCR 模型</li>
            <li><code className="text-amber-700">POST /v1/ocr/submit</code> — 上傳檔案、回傳 job_id</li>
            <li><code className="text-amber-700">GET  /v1/ocr/jobs/&#123;id&#125;</code> — 查詢 job 進度與結果</li>
            <li><code className="text-amber-700">GET  /v1/ocr/queue</code> — 各 backend 排隊狀況</li>
          </ul>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          <strong>注意：</strong>之前這頁的「前往 OCR 服務」按鈕誤連到另一個團隊（財務）的水單辨識系統，已移除。
          若需要 AI 後處理（把 OCR 文字轉成結構化 Markdown），請呼叫 <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">/v1/chat/completions</code> 自行帶 system prompt，
          不要依賴已停用的 <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">/v1/ocr/jobs/&#123;id&#125;/format</code>（會回 410 Gone）。
        </div>
      </div>
    </div>
  )
}

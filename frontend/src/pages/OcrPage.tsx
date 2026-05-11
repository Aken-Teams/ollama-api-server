import { FileImage, ExternalLink } from 'lucide-react'

export default function OcrPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">OCR 工具</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <FileImage size={36} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">OCR 圖片文字辨識</h2>
        <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
          OCR 功能已整合到獨立的 OCR 服務中。點擊下方連結前往 OCR 服務頁面，
          支援圖片上傳、AI 格式化等功能。
        </p>

        <a
          href="https://ocr.theaken.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-medium px-6 py-3 rounded-xl transition"
        >
          <ExternalLink size={16} />
          前往 OCR 服務
        </a>

        <div className="mt-8 grid grid-cols-3 gap-4 text-left">
          {[
            { title: '圖片 OCR', desc: '支援 JPG、PNG、TIFF 等格式的文字辨識' },
            { title: 'AI 格式化', desc: '利用 AI 模型將 OCR 結果整理成結構化文字' },
            { title: 'PDF 辨識', desc: '支援 PDF 檔案的文字提取與辨識' },
          ].map(item => (
            <div key={item.title} className="bg-gray-50 rounded-xl p-4">
              <div className="font-medium text-gray-800 text-sm mb-1">{item.title}</div>
              <div className="text-gray-500 text-xs">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

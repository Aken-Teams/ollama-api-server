import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { EXTERNAL_BASE_URL } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const BASE = EXTERNAL_BASE_URL

function CodeBlock({ code, lang = 'python' }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 rounded-t-xl">
        <span className="text-xs text-gray-400">{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="text-gray-400 hover:text-white transition"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="bg-gray-900 text-green-400 text-xs font-mono p-4 rounded-b-xl overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  )
}

export default function DocsPage() {
  const { apiKey } = useAuthStore()
  const displayKey = apiKey ?? 'YOUR_API_KEY'

  const sections = [
    {
      id: 'overview',
      title: '概覽',
      content: (
        <div className="space-y-3 text-sm text-gray-600">
          <p>PJ_API 是一個 OpenAI 相容的私有 AI API 閘道，統一整合多個 AI 模型後端服務。</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="font-medium text-amber-800 mb-2">基本資訊</div>
            <div className="space-y-1 font-mono text-xs">
              <div><span className="text-gray-500">Base URL：</span><span className="text-amber-700">{BASE}/v1</span></div>
              <div><span className="text-gray-500">API Key：</span><span className="text-amber-700">{displayKey.slice(0, 20)}...</span></div>
              <div><span className="text-gray-500">協議：</span><span className="text-amber-700">OpenAI Compatible</span></div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'models',
      title: '可用模型',
      content: (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="px-4 py-2 text-left">Model ID</th>
                  <th className="px-4 py-2 text-left">說明</th>
                  <th className="px-4 py-2 text-left">適合用途</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { id: 'gemma4:latest', desc: 'Gemma4 8B', use: '快速問答、翻譯' },
                  { id: 'gemma3:27b', desc: 'Gemma3 27B', use: '一般任務、程式' },
                  { id: 'nemotron3:33b', desc: 'Nemotron3 33B', use: '推理、分析' },
                  { id: 'mlx-community/gpt-oss-120b-MXFP4-Q4', desc: 'GPT-OSS 120B', use: '複雜推理、長文' },
                  { id: 'mlx-community/Qwen2.5-VL-7B-Instruct-4bit', desc: 'Qwen2.5-VL 7B', use: '圖片理解、視覺' },
                  { id: 'auto', desc: '自動路由', use: '智能選擇最適模型' },
                  { id: 'deepseek-chat', desc: 'DeepSeek V3 (雲端)', use: '複雜任務、長文分析' },
                ].map(m => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">{m.id}</td>
                    <td className="px-4 py-2.5 text-gray-600">{m.desc}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{m.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    },
    {
      id: 'python',
      title: 'Python 範例',
      content: (
        <div className="space-y-4">
          <CodeBlock lang="bash" code={`pip install openai`} />
          <CodeBlock code={`from openai import OpenAI

client = OpenAI(
    base_url="${BASE}/v1",
    api_key="${displayKey}"
)

# 基本對話
response = client.chat.completions.create(
    model="gemma4:latest",
    messages=[
        {"role": "user", "content": "你好，請自我介紹"}
    ]
)
print(response.choices[0].message.content)`} />

          <h3 className="font-medium text-gray-800">串流模式</h3>
          <CodeBlock code={`for chunk in client.chat.completions.create(
    model="gemma4:latest",
    messages=[{"role": "user", "content": "請解釋量子糾纏"}],
    stream=True
):
    content = chunk.choices[0].delta.content
    if content:
        print(content, end="", flush=True)`} />

          <h3 className="font-medium text-gray-800">視覺模型（圖片輸入）</h3>
          <CodeBlock code={`import base64

with open("image.jpg", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

response = client.chat.completions.create(
    model="mlx-community/Qwen2.5-VL-7B-Instruct-4bit",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "請描述這張圖片"},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}
        ]
    }]
)
print(response.choices[0].message.content)`} />
        </div>
      )
    },
    {
      id: 'curl',
      title: 'cURL 範例',
      content: (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-800">列出模型</h3>
          <CodeBlock lang="bash" code={`curl ${BASE}/v1/models \\
  -H "Authorization: Bearer ${displayKey}"`} />

          <h3 className="text-sm font-medium text-gray-800">聊天完成</h3>
          <CodeBlock lang="bash" code={`curl ${BASE}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${displayKey}" \\
  -d '{
    "model": "gemma4:latest",
    "messages": [{"role": "user", "content": "你好"}]
  }'`} />
        </div>
      )
    },
    {
      id: 'js',
      title: 'JavaScript 範例',
      content: (
        <CodeBlock lang="javascript" code={`import OpenAI from 'openai'; // npm install openai

const client = new OpenAI({
  baseURL: '${BASE}/v1',
  apiKey: '${displayKey}',
  dangerouslyAllowBrowser: true, // 生產環境請從後端代理
});

// 基本對話
const response = await client.chat.completions.create({
  model: 'gemma4:latest',
  messages: [{ role: 'user', content: '你好' }],
});
console.log(response.choices[0].message.content);

// 串流
const stream = await client.chat.completions.create({
  model: 'gemma4:latest',
  messages: [{ role: 'user', content: '請寫一首詩' }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}`} />
      )
    },
    {
      id: 'endpoints',
      title: 'API 端點',
      content: (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="px-4 py-2 text-left">方法</th>
                <th className="px-4 py-2 text-left">路徑</th>
                <th className="px-4 py-2 text-left">說明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { method: 'GET', path: '/v1/models', desc: '列出所有可用模型' },
                { method: 'POST', path: '/v1/chat/completions', desc: '聊天完成（支援串流）' },
                { method: 'POST', path: '/api/login', desc: '使用者登入' },
                { method: 'GET', path: '/api/keys', desc: '列出 API Keys（管理員）' },
                { method: 'POST', path: '/api/keys', desc: '建立 API Key（管理員）' },
                { method: 'PUT', path: '/api/keys/:id', desc: '更新 API Key（管理員）' },
                { method: 'DELETE', path: '/api/keys/:id', desc: '刪除 API Key（管理員）' },
                { method: 'POST', path: '/api/keys/:id/regenerate', desc: '重新產生 API Key（管理員）' },
                { method: 'GET', path: '/api/stats', desc: '使用統計（管理員）' },
                { method: 'GET', path: '/api/usage', desc: '使用記錄（管理員）' },
                { method: 'GET', path: '/api/users', desc: '使用者列表（管理員）' },
                { method: 'POST', path: '/api/users', desc: '建立使用者（管理員）' },
              ].map(e => (
                <tr key={e.path + e.method}>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                      e.method === 'GET' ? 'bg-blue-100 text-blue-700' :
                      e.method === 'POST' ? 'bg-emerald-100 text-emerald-700' :
                      e.method === 'PUT' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {e.method}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{e.path}</td>
                  <td className="px-4 py-2.5 text-gray-600">{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    },
  ]

  const [activeSection, setActiveSection] = useState('overview')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">API 文檔</h1>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <div className="w-48 shrink-0">
          <nav className="sticky top-0 space-y-1">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                  activeSection === s.id
                    ? 'bg-amber-100 text-amber-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {s.title}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-6">
          {sections.map(s => (
            <div key={s.id} className={activeSection === s.id ? 'block' : 'hidden'}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{s.title}</h2>
              {s.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

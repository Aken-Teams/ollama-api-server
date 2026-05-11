import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

export function formatNumber(n: number | undefined | null): string {
  if (n == null) return '0'
  return n.toLocaleString('zh-TW')
}

export const EXTERNAL_BASE_URL = 'https://ollama_pjapi.theaken.com'

// Model metadata for onboard cards.
// thinking=true 表示模型會先輸出 reasoning，最終答覆才在 message.content（可能空字串）；
// 此時呼叫端建議 max_tokens >= 1500 並 fallback 看 message.reasoning。
export const MODEL_META: Record<string, { note: string; vision: boolean; thinking: boolean }> = {
  // llama.cpp (native)
  'gpt-oss:120b':                              { note: '120B（llama.cpp），現由 MLX 21192 backend 承接',  vision: false, thinking: true  },
  'gemma4:31b':                                { note: '31B（llama.cpp），reasoning + mmproj 多模態',     vision: false, thinking: true  },
  // Ollama local
  'gemma4:latest':                             { note: '8B（Ollama），最快，128K context，一般對話',     vision: false, thinking: true  },
  'gemma3:27b':                                { note: '27B（Ollama），多模態，品質與速度均衡',           vision: false, thinking: true  },
  'nemotron3:33b':                             { note: '33B（Ollama），NVIDIA Omni 多模態，推理',         vision: false, thinking: true  },
  'qwen2.5vl:7b':                              { note: '7B（Ollama），視覺模型',                          vision: true,  thinking: false },
  // MLX (Apple Silicon)
  'mlx-community/Qwen2.5-1.5B-Instruct-4bit':  { note: '1.5B（MLX），極快極小，分類/低延遲',             vision: false, thinking: false },
  'mlx-community/gpt-oss-120b-MXFP4-Q4':       { note: '120B（MLX），最強，速度比 llama.cpp 快 1.3–2x',  vision: false, thinking: true  },
  'mlx-community/gemma-3-27b-it-qat-4bit':     { note: '27B（MLX, QAT 4-bit），長 context，視覺',         vision: false, thinking: true  },
  'mlx-community/Qwen2.5-VL-7B-Instruct-4bit': { note: '7B（MLX），視覺模型，本地 OCR/RAG',              vision: true,  thinking: false },
  'mlx-community/Qwen3.6-35B-A3B-4bit':        { note: '35B/3B 激活（MLX 4-bit ~20GB），thinking，256K',  vision: false, thinking: true  },
  'mlx-community/Qwen2.5-Coder-32B-Instruct-4bit': { note: '32B（MLX 4-bit ~18GB），程式碼專精，Claude Code 平替', vision: false, thinking: false },
  'mlx-community/Qwen2.5-Coder-7B-Instruct-4bit':  { note: '7B（MLX 4-bit ~5GB），極快，IDE 補全/問答',           vision: false, thinking: false },
  // DeepSeek cloud
  'deepseek-v4-flash':                         { note: 'DeepSeek V4 Flash 雲端，低延遲高吞吐',           vision: false, thinking: true  },
  'deepseek-v4-pro':                           { note: 'DeepSeek V4 Pro 雲端，深度推理',                 vision: false, thinking: true  },
}

// Back-compat alias for any existing imports.
export const MODEL_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_META).map(([k, v]) => [k, v.note])
)

export function getModelProvider(modelId: string): string {
  if (modelId.startsWith('deepseek')) return 'DeepSeek'
  // Check Ollama tag-format models before generic 'mlx' substring match
  if (modelId.includes(':')) {
    const name = modelId.split(':')[0].toLowerCase()
    if (['gemma3', 'gemma4', 'nemotron3', 'qwen3.6', 'qwen2.5vl'].includes(name)) return 'Ollama'
  }
  if (modelId.startsWith('mlx-community')) return 'MLX'
  if (modelId.includes('mlx')) return 'MLX'
  return 'llama.cpp'
}

/**
 * Build a Claude-Code-friendly onboard card for one specific model.
 * The card is markdown-ish so AI coding agents (Claude Code / Codex / OpenCode)
 * can parse the BASE_URL / API_KEY / MODEL constants and respect the
 * per-model 403 lock + thinking-model gotchas.
 */
export function buildOnboardCardText(apiKey: string, model: string): string {
  const meta = MODEL_META[model] ?? { note: '', vision: false, thinking: false }
  const tags: string[] = []
  if (meta.vision)   tags.push('vision')
  if (meta.thinking) tags.push('thinking')
  const tagStr = tags.length ? ` [${tags.join('/')}]` : ''

  const constraints: string[] = []
  constraints.push(
    `這把 API Key 只能呼叫 \`${model}\`。其他 model ID 一律會被 gateway 拒絕：` +
    `**系統不認識的（例如 \`gpt-4o\`、typo）回 400**；**系統認識但這把 Key 沒權限的回 403**。` +
    `所以絕對不要嘗試列表以外的模型，也不要把 400 錯誤訊息當作探測管道。`
  )
  constraints.push(
    `不可以使用 \`model: "auto"\` 或任何虛擬路由；系統已停用自動路由，務必明確指定一個真實 model ID。`
  )
  if (meta.thinking) {
    constraints.push(
      `這是 **thinking 模型** — 回應裡 \`choices[0].message\` 有兩個欄位：
   - \`content\`：最終答覆（可能為空字串！如果思考太久 tokens 不夠就沒輸出）
   - \`reasoning\`：思考過程（不會出現在 OpenAI 標準回應裡，這是本 gateway 額外傳的）
   呼叫此模型時 **務必設 \`max_tokens >= 1500\`**，否則 finish_reason='length' + content=''。`
    )
  }
  if (meta.vision) {
    constraints.push(
      `這是 **vision 模型** — 接受 OpenAI 標準的 multipart content：` +
      '`[{"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."}}, {"type":"text","text":"..."}]`。'
    )
  }
  if (meta.thinking) {
    constraints.push(
      `**stream 模式對 thinking 模型有已知 bug**：\`delta.content\` 會夾帶原始 harmony tokens（\`<|channel|>analysis<|message|>...<|end|>\` 是 reasoning、\`<|channel|>final<|message|>...\` 才是真正答覆），client 必須自己用 \`<|channel|>final<|message|>\` 切。**建議 thinking 模型一律用 non-stream（\`stream: false\`）**，gateway 會幫你切好放到 \`message.content\`。`
    )
  } else {
    constraints.push(
      `stream 模式回 SSE，格式同 OpenAI（\`data: {...}\\n\\n\` ... 最後 \`data: [DONE]\`）。`
    )
  }
  constraints.push(
    `部分模型（特別是 \`gpt-oss\` 系列、deepseek 雲端）會自稱「我是 ChatGPT，由 OpenAI 訓練」— 那是訓練資料的副作用，不是真實後端。如果你要對外露出回應，**請在 \`messages\` 開頭塞一個 system prompt 覆寫身份**（見下方範例）。`
  )
  const constraintsBlock = constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')

  // Python example tuned per primary model — pure stdlib urllib (no install required)
  const maxTokens = meta.thinking ? 1500 : 512
  const thinkingFallback = meta.thinking
    ? `# thinking 模型：content 可能空字串，記得 fallback 看 reasoning
text = msg.get("content") or msg.get("reasoning") or ""`
    : `text = msg.get("content", "")`
  const SYSTEM_PROMPT = '你是本地端 LLM 助理。請以繁體中文回答；不要自稱 ChatGPT 或 OpenAI。'
  let pyExample: string
  if (meta.vision) {
    pyExample = `import base64, json, urllib.request

with open("image.jpg", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

body = json.dumps({
    "model": MODEL,
    "messages": [
        {"role": "system", "content": "${SYSTEM_PROMPT}"},
        {"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
            {"type": "text", "text": "描述這張圖片"},
        ]},
    ],
    "max_tokens": ${maxTokens},
}).encode("utf-8")

req = urllib.request.Request(
    f"{BASE_URL}/chat/completions",
    method="POST",
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    data=body,
)
with urllib.request.urlopen(req, timeout=120) as r:
    data = json.loads(r.read())
msg = data["choices"][0]["message"]
${thinkingFallback}
print(text)`
  } else {
    pyExample = `import json, urllib.request

body = json.dumps({
    "model": MODEL,
    "messages": [
        {"role": "system", "content": "${SYSTEM_PROMPT}"},
        {"role": "user", "content": "你好"},
    ],
    "max_tokens": ${maxTokens},
}).encode("utf-8")

req = urllib.request.Request(
    f"{BASE_URL}/chat/completions",
    method="POST",
    headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    data=body,
)
with urllib.request.urlopen(req, timeout=120) as r:
    data = json.loads(r.read())
msg = data["choices"][0]["message"]
${thinkingFallback}
print(text)`
  }

  return `# 私有 LLM API 存取資訊（OpenAI 相容）

請用以下資訊呼叫 chat completions API 完成接下來的任務。
此 endpoint 完整相容 OpenAI \`/v1/chat/completions\` 規格。

## 連線設定

\`\`\`python
BASE_URL = "${EXTERNAL_BASE_URL}/v1"
API_KEY  = "${apiKey}"
MODEL    = "${model}"
\`\`\`

## 使用模型

- ${model}${tagStr}
  ${meta.note || '(未在 MODEL_META 註冊的模型)'}

## 重要限制（請務必遵守）

${constraintsBlock}

## Python 範例（純標準庫 urllib，**不必裝任何套件**）

\`\`\`python
${pyExample}
\`\`\`

> 若已裝 \`openai\` SDK 也可用：\`OpenAI(base_url=BASE_URL, api_key=API_KEY).chat.completions.create(model=MODEL, messages=[...], max_tokens=${maxTokens})\`，response 是同樣的結構。
> 不建議用 \`curl\` 直接打：在 PowerShell / cmd.exe 下，\`curl\` 是 \`Invoke-WebRequest\` 別名，會把 JSON 內的雙引號吃掉。請優先用 Python。
`
}

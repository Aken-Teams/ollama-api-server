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
  'mlx-community/Qwen3.6-35B-A3B-bf16':        { note: '35B/3B 激活（MLX BF16），thinking 模型，256K',   vision: false, thinking: true  },
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
    `這把 API Key 被「鎖死」只能呼叫 \`${model}\`；用其他 model ID 一律回 403「沒有使用模型權限」。`
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
  constraints.push(
    `stream 模式回 SSE，格式同 OpenAI（\`data: {...}\\n\\n\` ... 最後 \`data: [DONE]\`）；thinking 模型的 reasoning 不會出現在 delta，只在 final message。`
  )
  const constraintsBlock = constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')

  const maxTokens = meta.thinking ? 1500 : 512
  let pyExample: string
  if (meta.vision) {
    pyExample = `import base64
from openai import OpenAI

client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

with open("image.jpg", "rb") as f:
    img_b64 = base64.b64encode(f.read()).decode()

resp = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
        {"type": "text", "text": "描述這張圖片"},
    ]}],
    max_tokens=${maxTokens},
)
print(resp.choices[0].message.content)`
  } else {
    const tail = meta.thinking
      ? `
# thinking 模型：content 可能空字串，記得 fallback 看 reasoning
text = resp.choices[0].message.content or getattr(resp.choices[0].message, "reasoning", "")`
      : `
text = resp.choices[0].message.content`
    pyExample = `from openai import OpenAI

client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

resp = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": "你好"}],
    max_tokens=${maxTokens},
)${tail}
print(text)`
  }

  const curlExample = `curl -s ${EXTERNAL_BASE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [{"role": "user", "content": "你好"}],
    "max_tokens": ${maxTokens}
  }'`

  return `# 私有 LLM API 存取資訊（OpenAI 相容）

請用以下資訊呼叫 chat completions API 完成接下來的任務。
完整相容 OpenAI Python / Node SDK — 把 base_url 改成下面那個 URL 即可。

## 連線設定

\`\`\`bash
BASE_URL="${EXTERNAL_BASE_URL}/v1"
API_KEY="${apiKey}"
MODEL="${model}"
\`\`\`

## 使用模型

- ${model}${tagStr}
  ${meta.note || '(未在 MODEL_META 註冊的模型)'}

## 重要限制（請務必遵守）

${constraintsBlock}

## Python 範例

\`\`\`python
# pip install openai
${pyExample}
\`\`\`

## curl 範例

\`\`\`bash
${curlExample}
\`\`\`

## 你的任務

（請把實際任務寫在這之後）`
}

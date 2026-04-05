// ==========================================================================
// UTILS MODULE
// ==========================================================================

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function cleanModelOutput(text) {
    if (!text) return '';

    // 首先過濾掉後端伺服器的技術日誌訊息
    let cleaned = text;

    // 過濾模型載入和圖片處理的日誌訊息
    const logPatterns = [
        /main: loading model:.*?\n?/g,
        /encoding image slice\.{3}\n?/g,
        /image slice encoded in \d+ ms\n?/g,
        /decoding image batch \d+\/\d+, n_tokens_batch = \d+\n?/g,
        /image decoded \(batch \d+\/\d+\) in \d+ ms\n?/g,
        /llama_model_loader:.*?\n?/g,
        /llm_load_.*?:.*?\n?/g,
        /sampler seed:.*?\n?/g,
        /sampler params:.*?\n?/g,
        /sampler chain:.*?\n?/g,
        /generate:.*?\n?/g,
    ];

    for (const pattern of logPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }
    cleaned = cleaned.trim();

    // 方法1: 嘗試提取 <|channel|>final<|message|> 後的內容
    const finalMatch = cleaned.match(/<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/);
    if (finalMatch) {
        return finalMatch[1].trim();
    }

    // 方法2: 如果有 assistant<|channel|>final 的格式
    const assistantMatch = cleaned.match(/assistant<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/);
    if (assistantMatch) {
        return assistantMatch[1].trim();
    }

    // 方法3: 尋找最後一個 <|message|> 之後的內容 (可能是最終回覆)
    const parts = cleaned.split(/<\|message\|>/);
    if (parts.length > 1) {
        // 取最後一部分，並移除結尾標記
        let lastPart = parts[parts.length - 1];
        lastPart = lastPart.replace(/<\|end\|>[\s\S]*/g, '').trim();
        // 確認這不是 analysis 內容（通常 analysis 很長且包含英文思考）
        if (lastPart.length > 0 && !lastPart.startsWith('The user')) {
            return lastPart;
        }
    }

    // 方法4: 移除所有標記格式的內容
    // 移除 <|channel|>analysis<|message|>...直到下一個<|end|>或<|start|>
    cleaned = cleaned.replace(/<\|channel\|>analysis<\|message\|>[\s\S]*?(?=<\|end\|>|<\|start\|>|$)/g, '');
    // 移除剩餘的標記
    cleaned = cleaned.replace(/<\|[^|>]+\|>/g, '');
    cleaned = cleaned.trim();

    return cleaned || text;
}

// Markdown 格式化
function formatMarkdown(text) {
    if (!text) return '';

    // 首先清理模型內部標記
    text = cleanModelOutput(text);

    // 先處理程式碼區塊 (避免內部被其他規則處理)
    const codeBlocks = [];
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        codeBlocks.push({ lang, code: code.trim() });
        return `__CODE_BLOCK_${index}__`;
    });

    // 處理表格
    const tableRegex = /^\|(.+)\|$/gm;
    const lines = text.split('\n');
    let inTable = false;
    let tableHtml = '';
    let tableRows = [];
    let processedLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('|') && line.endsWith('|')) {
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            // 跳過分隔行 (如 |---|---|---|)
            if (!/^\|[\s\-:]+\|$/.test(line)) {
                tableRows.push(line);
            }
        } else {
            if (inTable) {
                // 結束表格，生成 HTML
                processedLines.push(generateTableHtml(tableRows));
                inTable = false;
                tableRows = [];
            }
            processedLines.push(line);
        }
    }
    // 處理最後一個表格
    if (inTable && tableRows.length > 0) {
        processedLines.push(generateTableHtml(tableRows));
    }
    text = processedLines.join('\n');

    // 行內程式碼
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 標題
    text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // 粗體和斜體
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // 引用區塊
    text = text.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // 無序清單
    text = text.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // 有序清單
    text = text.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // 水平線
    text = text.replace(/^---$/gm, '<hr>');

    // 連結
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 還原程式碼區塊
    text = text.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
        const block = codeBlocks[parseInt(index)];
        const langLabel = block.lang ? `<span style="position:absolute;top:5px;right:10px;color:#888;font-size:11px;">${block.lang}</span>` : '';
        return `<pre style="position:relative;">${langLabel}<code>${escapeHtml(block.code)}</code></pre>`;
    });

    // 段落 (換行處理)
    text = text.replace(/\n\n/g, '</p><p>');
    text = text.replace(/\n/g, '<br>');

    // 包裝段落
    if (!text.startsWith('<')) {
        text = '<p>' + text + '</p>';
    }

    // 清理空標籤
    text = text.replace(/<p><\/p>/g, '');
    text = text.replace(/<p><br><\/p>/g, '');

    return text;
}

// 生成表格 HTML
function generateTableHtml(rows) {
    if (rows.length === 0) return '';

    let html = '<table class="md-table">';

    rows.forEach((row, index) => {
        const cells = row.split('|').filter(cell => cell.trim() !== '');
        const tag = index === 0 ? 'th' : 'td';
        const rowTag = index === 0 ? 'thead' : (index === 1 ? 'tbody' : '');

        if (index === 0) html += '<thead>';
        if (index === 1) html += '<tbody>';

        html += '<tr>';
        cells.forEach(cell => {
            html += `<${tag}>${cell.trim()}</${tag}>`;
        });
        html += '</tr>';

        if (index === 0) html += '</thead>';
    });

    if (rows.length > 1) html += '</tbody>';
    html += '</table>';

    return html;
}

// 複製程式碼
function copyCode(button) {
    const codeBlock = button.parentElement.querySelector('pre');
    const text = codeBlock.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = '已複製!';
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    });
}

// 載入統計數據
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== OCR 文件辨識功能 =====
let ocrUploadedFile = null;
let ocrSelectedModel = 'llava-ocr';
let ocrMethodMode = 'ppocrv5';  // 'ppocrv5' 或 'vision'
let ocrImageBase64 = null;  // 用於視覺模型的 base64 圖片

// 初始化 OCR 功能
document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('ocr-upload-area');
    const fileInput = document.getElementById('ocr-input');

    if (uploadArea && fileInput) {
        // 點擊上傳
        uploadArea.addEventListener('click', () => fileInput.click());

        // 檔案選擇
        fileInput.addEventListener('change', handleOcrFileSelect);

        // 拖放支援
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) processOcrFile(file);
        });
    }

    // 載入 OCR 模型列表
    loadOcrModels();
});

// OCR 模型資料快取
let ocrModelsData = [];

// 載入 OCR 模型列表
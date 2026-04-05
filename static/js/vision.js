// ==========================================================================
// VISION MODULE
// ==========================================================================

function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processImageFile(file);
    }
}

// 處理圖片檔案
function processImageFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('請選擇圖片檔案');
        return;
    }

    if (file.size > 20 * 1024 * 1024) {
        alert('圖片大小不能超過 20MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedImageBase64 = e.target.result;
        const preview = document.getElementById('image-preview');
        const placeholder = document.getElementById('upload-placeholder');
        const removeBtn = document.getElementById('remove-image-btn');

        preview.src = uploadedImageBase64;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
        removeBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
}

// 移除圖片
function removeImage() {
    uploadedImageBase64 = null;
    const preview = document.getElementById('image-preview');
    const placeholder = document.getElementById('upload-placeholder');
    const removeBtn = document.getElementById('remove-image-btn');
    const input = document.getElementById('image-input');

    preview.style.display = 'none';
    preview.src = '';
    placeholder.style.display = 'flex';
    removeBtn.style.display = 'none';
    input.value = '';
}

// 設置拖放事件
document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('image-upload-area');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) {
                processImageFile(file);
            }
        });
    }

    // 音訊上傳拖放事件
    const audioUploadArea = document.getElementById('audio-upload-area');
    if (audioUploadArea) {
        audioUploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            audioUploadArea.classList.add('dragover');
        });

        audioUploadArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            audioUploadArea.classList.remove('dragover');
        });

        audioUploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            audioUploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('audio/')) {
                handleAudioFile(file);
            }
        });
    }
});

// ===== 麥克風即時錄音功能 =====

// 切換麥克風錄音
function handleVisionImageSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleVisionImageFile(file);
    }
}

function handleVisionImageFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('請選擇圖片檔案');
        return;
    }

    if (file.size > 20 * 1024 * 1024) {
        alert('圖片大小不能超過 20MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        visionImageBase64 = e.target.result;
        const preview = document.getElementById('vision-image-preview');
        const placeholder = document.getElementById('vision-upload-placeholder');
        const previewContainer = document.getElementById('vision-image-preview-container');
        const removeBtn = document.getElementById('remove-vision-image-btn');

        preview.src = visionImageBase64;
        previewContainer.style.display = 'block';
        placeholder.style.display = 'none';
        removeBtn.style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
}

// 移除視覺模型圖片
function removeVisionImage() {
    visionImageBase64 = null;
    const preview = document.getElementById('vision-image-preview');
    const placeholder = document.getElementById('vision-upload-placeholder');
    const previewContainer = document.getElementById('vision-image-preview-container');
    const removeBtn = document.getElementById('remove-vision-image-btn');
    const input = document.getElementById('vision-image-input');

    preview.src = '';
    previewContainer.style.display = 'none';
    placeholder.style.display = 'flex';
    removeBtn.style.display = 'none';
    input.value = '';
}

// 設定視覺模型提示詞
function setVisionPrompt(prompt) {
    document.getElementById('vision-prompt').value = prompt;
}

// 分析視覺模型圖片
async function analyzeVisionImage() {
    if (!visionImageBase64) {
        alert('請先上傳圖片');
        return;
    }

    const prompt = document.getElementById('vision-prompt').value.trim();
    if (!prompt) {
        alert('請輸入提示詞');
        return;
    }

    const resultContainer = document.getElementById('vision-result-container');
    const resultDiv = document.getElementById('vision-result');
    const resultStatus = document.getElementById('vision-result-status');
    const resultTime = document.getElementById('vision-result-time');
    const resultTokens = document.getElementById('vision-result-tokens');

    resultContainer.style.display = 'block';
    resultStatus.textContent = '分析中...';
    resultStatus.classList.add('streaming');
    resultDiv.innerHTML = `
        <div class="vision-notice">
            <div class="notice-icon">👁️</div>
            <div class="notice-text">
                <strong>視覺模型處理中</strong><br>
                由於視覺模型 (72B 參數) 需要處理圖片資訊，回應時間可能需要 30 秒至 2 分鐘，請耐心等候...
            </div>
        </div>`;
    resultTime.textContent = '';
    resultTokens.textContent = '';

    const startTime = Date.now();

    try {
        const response = await authFetch(`${API_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llava:7b',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: visionImageBase64 } }
                    ]
                }],
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const elapsed = Date.now() - startTime;

        resultStatus.textContent = '分析完成';
        resultStatus.classList.remove('streaming');
        resultTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;

        if (data.choices && data.choices[0] && data.choices[0].message) {
            const content = data.choices[0].message.content;
            const contentLower = content.toLowerCase();

            // 檢查是否為後端錯誤（推理超時、圖片解碼失敗等）
            const isBackendError = contentLower.includes('inference timeout') ||
                                   contentLower.includes('failed to decode image') ||
                                   contentLower.includes('llama_model_load') ||
                                   contentLower.includes('ggml_metal_init') ||
                                   (contentLower.includes('error') && content.length > 500);

            if (isBackendError) {
                resultStatus.textContent = '服務異常';
                resultDiv.innerHTML = `
                    <div style="color: #dc3545; margin-bottom: 15px;">
                        <strong>🔧 視覺模型服務異常</strong>
                    </div>
                    <div class="vision-notice" style="background: #fff3cd; border-color: #ffc107;">
                        <div class="notice-icon">⚠️</div>
                        <div class="notice-text">
                            <strong>問題：</strong> 視覺模型處理圖片時發生錯誤<br><br>
                            <strong>可能的原因：</strong><br>
                            • 圖片格式不支援或解碼失敗<br>
                            • 圖片太大或解析度過高<br>
                            • 後端服務配置問題<br><br>
                            <strong>建議：</strong><br>
                            1. 嘗試使用 JPG 或 PNG 格式的圖片<br>
                            2. 縮小圖片尺寸後重試<br>
                            3. 聯繫管理員檢查服務狀態
                        </div>
                    </div>`;
                return;
            }

            lastVisionResult = content;
            resultDiv.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(content)}</div>`;

            // 顯示 token 使用量
            if (data.usage) {
                resultTokens.textContent = `Tokens: ${data.usage.prompt_tokens || 0} + ${data.usage.completion_tokens || 0} = ${data.usage.total_tokens || 0}`;
            }
        } else {
            lastVisionResult = JSON.stringify(data, null, 2);
            resultDiv.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        }

    } catch (error) {
        resultStatus.textContent = '分析失敗';
        resultStatus.classList.remove('streaming');

        // 檢查是否為 504 超時錯誤或後端服務問題
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('504') || errorMsg.includes('gateway time-out') || errorMsg.includes('timeout')) {
            resultDiv.innerHTML = `
                <div style="color: #dc3545; margin-bottom: 15px;">
                    <strong>⏱️ 視覺模型服務暫時無法使用</strong>
                </div>
                <div class="vision-notice" style="background: #fff3cd; border-color: #ffc107;">
                    <div class="notice-icon">🔧</div>
                    <div class="notice-text">
                        <strong>狀態：</strong> LLaVA 7B 模型服務目前回應超時<br><br>
                        <strong>可能的原因：</strong><br>
                        • 本地 Ollama 服務未啟動<br>
                        • GPU 資源忙碌或記憶體不足<br>
                        • 模型正在載入中<br><br>
                        <strong>建議：</strong><br>
                        1. 請稍後再試（等待 1-2 分鐘）<br>
                        2. 確認 Ollama 服務已啟動<br>
                        3. 檢查 GPU 使用狀態 (nvidia-smi)
                    </div>
                </div>`;
        } else {
            resultDiv.innerHTML = `<div style="color: #dc3545;">❌ 錯誤: ${escapeHtml(error.message)}</div>`;
        }
    }
}

// 複製視覺模型結果
function copyVisionResult() {
    if (lastVisionResult) {
        navigator.clipboard.writeText(lastVisionResult).then(() => {
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ 已複製';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }
}

// ==================== 歷史紀錄功能 (密碼保護) ====================

// 點擊版本號開啟歷史紀錄頁面
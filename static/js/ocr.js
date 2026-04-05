// ==========================================================================
// OCR MODULE
// ==========================================================================

async function loadOcrModels() {
    const modelSelect = document.getElementById('ocr-model-select');
    if (!modelSelect) return;

    try {
        const response = await authFetch(`${API_URL}/v1/ocr/models`);
        const data = await response.json();
        ocrModelsData = data.models;

        modelSelect.innerHTML = '';
        data.models.forEach((model, index) => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name + (model.available ? '' : ' (離線)');
            option.disabled = !model.available;
            option.dataset.description = model.description;
            option.dataset.features = model.features.join('、');
            option.dataset.bestFor = model.best_for;

            if (index === 0) {
                option.selected = true;
                ocrSelectedModel = model.id;
            }

            modelSelect.appendChild(option);
        });

        // 顯示第一個模型的描述
        updateOcrModelDescription(ocrModelsData[0]);
    } catch (error) {
        console.error('載入 OCR 模型失敗:', error);
        modelSelect.innerHTML = '<option value="">載入失敗，請重新整理</option>';
    }
}

// 模型選擇變更處理
function onOcrModelChange(select) {
    ocrSelectedModel = select.value;
    const model = ocrModelsData.find(m => m.id === select.value);
    if (model) {
        updateOcrModelDescription(model);
    }
}

// 更新模型描述顯示
function updateOcrModelDescription(model) {
    const descEl = document.getElementById('ocr-model-desc');
    if (descEl && model) {
        descEl.innerHTML = `
            <strong>${model.description}</strong><br>
            <span style="color: #1967d2;">特點：${model.features.join('、')}</span><br>
            <span style="color: #28a745;">適用：${model.best_for}</span>
        `;
    }
}

// 切換 OCR 辨識方式
function switchOcrMethod(method) {
    ocrMethodMode = method;

    // 更新按鈕狀態
    const buttons = document.querySelectorAll('.ocr-method-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.method === method);
    });

    // 切換設定區塊顯示
    const ppocrvSettings = document.getElementById('ppocrv5-settings');
    const deepseekSettings = document.getElementById('deepseek-settings');
    const visionSettings = document.getElementById('vision-settings');
    const languageGroup = document.querySelector('#ppocrv5-settings').parentElement.querySelector('.ocr-setting-group:nth-of-type(3)'); // 語言選擇區塊
    const formatGroup = document.querySelector('#ppocrv5-settings').parentElement.querySelector('.ocr-setting-group:nth-of-type(4)'); // 輸出格式區塊

    // 隱藏所有設定
    ppocrvSettings.style.display = 'none';
    deepseekSettings.style.display = 'none';
    visionSettings.style.display = 'none';
    if (languageGroup) languageGroup.style.display = 'none';
    if (formatGroup) formatGroup.style.display = 'none';

    if (method === 'ppocrv5') {
        ppocrvSettings.style.display = 'block';
        if (languageGroup) languageGroup.style.display = 'block';
        if (formatGroup) formatGroup.style.display = 'block';
    } else if (method === 'deepseek') {
        deepseekSettings.style.display = 'block';
    } else if (method === 'vision') {
        visionSettings.style.display = 'block';
    }
}

// 設定視覺模型提示詞
function setOcrVisionPrompt(prompt) {
    const textarea = document.getElementById('ocr-vision-prompt');
    if (textarea) {
        textarea.value = prompt;
    }
}

// 處理 OCR 檔案選擇
function handleOcrFileSelect(event) {
    const file = event.target.files[0];
    if (file) processOcrFile(file);
}

// 處理 OCR 檔案
function processOcrFile(file) {
    // 驗證檔案類型
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (!isImage && !isPdf) {
        alert('請選擇圖片檔案（JPG、PNG、GIF、WebP、BMP）或 PDF 檔案');
        return;
    }

    // 驗證檔案大小 (20MB)
    if (file.size > 20 * 1024 * 1024) {
        alert('檔案大小不能超過 20MB');
        return;
    }

    ocrUploadedFile = file;

    const preview = document.getElementById('ocr-preview');
    const pdfPreview = document.getElementById('ocr-pdf-preview');
    const placeholder = document.getElementById('ocr-upload-placeholder');
    const uploadArea = document.getElementById('ocr-upload-area');
    const fileInfo = document.getElementById('ocr-file-info');

    // 隱藏所有預覽
    preview.style.display = 'none';
    pdfPreview.style.display = 'none';
    placeholder.style.display = 'none';
    uploadArea.classList.add('has-file');

    if (isPdf) {
        // PDF 檔案預覽
        pdfPreview.style.display = 'block';
        document.getElementById('ocr-pdf-name').textContent = file.name;
        ocrImageBase64 = null; // PDF 不使用 base64 預覽

        // 顯示檔案資訊
        document.getElementById('ocr-file-name').textContent = file.name;
        document.getElementById('ocr-file-size').textContent = formatFileSize(file.size);
        fileInfo.style.display = 'block';

        // 啟用辨識按鈕
        document.getElementById('ocr-start-btn').disabled = false;
    } else {
        // 圖片檔案預覽
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.style.display = 'block';

            // 保存 base64 給視覺模型使用
            ocrImageBase64 = e.target.result;

            // 顯示檔案資訊
            document.getElementById('ocr-file-name').textContent = file.name;
            document.getElementById('ocr-file-size').textContent = formatFileSize(file.size);
            fileInfo.style.display = 'block';

            // 啟用辨識按鈕
            document.getElementById('ocr-start-btn').disabled = false;
        };
        reader.readAsDataURL(file);
    }
}

// 清除 OCR 檔案
function clearOcrFile() {
    ocrUploadedFile = null;
    ocrImageBase64 = null;
    const preview = document.getElementById('ocr-preview');
    const pdfPreview = document.getElementById('ocr-pdf-preview');
    const placeholder = document.getElementById('ocr-upload-placeholder');
    const uploadArea = document.getElementById('ocr-upload-area');
    const fileInfo = document.getElementById('ocr-file-info');
    const fileInput = document.getElementById('ocr-input');

    preview.style.display = 'none';
    preview.src = '';
    pdfPreview.style.display = 'none';
    placeholder.style.display = 'flex';
    uploadArea.classList.remove('has-file');
    fileInfo.style.display = 'none';
    fileInput.value = '';

    // 停用辨識按鈕
    document.getElementById('ocr-start-btn').disabled = true;
}

// 開始 OCR 辨識
async function startOcrRecognition() {
    if (!ocrUploadedFile) {
        alert('請先上傳圖片檔案');
        return;
    }

    const btn = document.getElementById('ocr-start-btn');
    const btnText = document.getElementById('ocr-btn-text');
    const btnLoading = document.getElementById('ocr-btn-loading');

    // 更新按鈕狀態
    btn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';

    const startTime = Date.now();

    try {
        let result;

        if (ocrMethodMode === 'vision') {
            // 使用視覺模型 (LLaVA)
            result = await performVisionOcr(startTime);
        } else if (ocrMethodMode === 'deepseek') {
            // 使用 DeepSeek OCR
            result = await performDeepSeekOcr(startTime);
        } else {
            // 使用傳統 PP-OCR
            result = await performPpOcr(startTime);
        }

        ocrResultData = result;
        displayOcrResult(result);

    } catch (error) {
        console.error('OCR 辨識錯誤:', error);
        alert('辨識失敗: ' + error.message);
    } finally {
        // 恢復按鈕狀態
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

// 使用傳統 PP-OCR 辨識
async function performPpOcr(startTime) {
    // 取得輸出格式
    const formats = [];
    if (document.getElementById('ocr-format-text').checked) formats.push('text');
    if (document.getElementById('ocr-format-json').checked) formats.push('json');
    if (document.getElementById('ocr-format-markdown').checked) formats.push('markdown');
    const outputFormat = formats.length > 1 ? 'all' : (formats[0] || 'text');

    const language = document.getElementById('ocr-language').value;

    const formData = new FormData();
    formData.append('file', ocrUploadedFile);
    formData.append('model', ocrSelectedModel);
    formData.append('output_format', outputFormat);
    formData.append('language', language);

    const response = await authFetch(`${API_URL}/v1/ocr/recognize`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        try {
            const error = JSON.parse(text);
            throw new Error(error.detail || 'OCR 辨識失敗');
        } catch (e) {
            throw new Error(`OCR 辨識失敗 (${response.status}): ${text.substring(0, 100)}`);
        }
    }

    return await response.json();
}

// 使用 DeepSeek OCR 辨識
async function performDeepSeekOcr(startTime) {
    const language = document.getElementById('deepseek-language').value;

    const formData = new FormData();
    formData.append('file', ocrUploadedFile);
    formData.append('model', 'deepseek-ocr');
    formData.append('output_format', 'all');
    formData.append('language', language);

    const response = await authFetch(`${API_URL}/v1/ocr/recognize`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        try {
            const error = JSON.parse(text);
            throw new Error(error.detail || 'DeepSeek OCR 辨識失敗');
        } catch (e) {
            throw new Error(`DeepSeek OCR 辨識失敗 (${response.status}): ${text.substring(0, 100)}`);
        }
    }

    return await response.json();
}

// 使用視覺模型辨識
async function performVisionOcr(startTime) {
    if (!ocrImageBase64) {
        throw new Error('圖片資料未載入，請重新上傳圖片');
    }

    const prompt = document.getElementById('ocr-vision-prompt').value.trim();
    if (!prompt) {
        throw new Error('請輸入分析提示詞');
    }

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
                    { type: 'image_url', image_url: { url: ocrImageBase64 } }
                ]
            }],
            stream: false
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`視覺模型回應錯誤: ${errorText}`);
    }

    const data = await response.json();
    const elapsed = Date.now() - startTime;

    // 取得回應文字
    let textContent = '';
    if (data.choices && data.choices[0] && data.choices[0].message) {
        textContent = data.choices[0].message.content;
    }

    // 轉換為 OCR 結果格式
    return {
        success: true,
        text: textContent,
        confidence: 0.95,  // 視覺模型無信心度，給預設值
        char_count: textContent.length,
        processing_time_ms: elapsed,
        model: 'llava:7b',
        model_name: 'LLaVA 7B 視覺模型',
        result: {
            text: textContent,
            prompt: prompt
        }
    };
}

// 顯示 OCR 結果
function displayOcrResult(result) {
    const placeholder = document.getElementById('ocr-result-placeholder');
    const tabs = document.getElementById('ocr-result-tabs');
    const downloadGroup = document.getElementById('ocr-download-group');
    const stats = document.getElementById('ocr-stats');

    // 隱藏佔位符，顯示結果
    placeholder.style.display = 'none';
    tabs.style.display = 'flex';
    downloadGroup.style.display = 'flex';
    stats.style.display = 'flex';

    // 填充結果內容
    const textOutput = document.getElementById('ocr-text-output');
    const jsonOutput = document.getElementById('ocr-json-output');
    const markdownOutput = document.getElementById('ocr-markdown-output');

    // 純文字
    const textContent = result.text || (result.result && result.result.text) || '';
    textOutput.textContent = textContent;

    // JSON
    const jsonContent = result.result || { text: textContent, confidence: result.confidence, char_count: result.char_count };
    jsonOutput.textContent = JSON.stringify(jsonContent, null, 2);

    // Markdown
    const markdownContent = result.markdown || textContent;
    markdownOutput.innerHTML = markdownToHtml(markdownContent);

    // 統計資訊
    document.getElementById('ocr-time').textContent = (result.processing_time_ms / 1000).toFixed(2) + 's';
    document.getElementById('ocr-confidence').textContent = (result.confidence * 100).toFixed(1) + '%';
    document.getElementById('ocr-chars').textContent = result.char_count.toLocaleString();
    document.getElementById('ocr-model-used').textContent = result.model_name || result.model;

    // 顯示純文字結果
    switchOcrResultTab('text');
}

// 簡單的 Markdown 轉 HTML
function markdownToHtml(md) {
    if (!md) return '';
    return md
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>');
}

// 切換 OCR 結果標籤頁
function switchOcrResultTab(tab) {
    const tabs = document.querySelectorAll('.ocr-tab');
    const contents = document.querySelectorAll('.ocr-result-content');

    tabs.forEach(t => {
        t.classList.remove('active');
        if (t.textContent.includes(tab === 'text' ? '純文字' : tab === 'json' ? 'JSON' : 'Markdown')) {
            t.classList.add('active');
        }
    });

    contents.forEach(c => c.style.display = 'none');
    document.getElementById(`ocr-result-${tab}`).style.display = 'block';
}

// 下載 OCR 結果
function downloadOcrResult() {
    const format = document.getElementById('ocr-download-format').value;
    let content, filename, mimeType;

    const textContent = ocrResultData.text || (ocrResultData.result && ocrResultData.result.text) || '';

    switch (format) {
        case 'txt':
            content = textContent;
            filename = 'ocr_result.txt';
            mimeType = 'text/plain';
            break;
        case 'json':
            content = JSON.stringify(ocrResultData.result || { text: textContent }, null, 2);
            filename = 'ocr_result.json';
            mimeType = 'application/json';
            break;
        case 'md':
            content = ocrResultData.markdown || textContent;
            filename = 'ocr_result.md';
            mimeType = 'text/markdown';
            break;
    }

    const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


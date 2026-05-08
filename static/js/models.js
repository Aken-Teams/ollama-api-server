// ==========================================================================
// MODELS MODULE
// ==========================================================================

async function loadModelOptions() {
    const select = document.getElementById('model-select');
    try {
        const response = await authFetch(`${API_URL}/v1/models`);
        const data = await response.json();

        if (data.data && data.data.length > 0) {
            if (window.AppStore) AppStore.set('models', data.data);
            modelsData = data.data;
            select.innerHTML = data.data.map(model => {
                const name = model.info ? model.info.name : model.id;
                return `<option value="${model.id}">${name}</option>`;
            }).join('');
            // 顯示第一個模型的資訊
            showModelInfo();
        } else {
            select.innerHTML = '<option value="">無可用模型</option>';
        }
    } catch (error) {
        console.error('載入模型失敗:', error);
        select.innerHTML = `<option value="">載入失敗: ${error.message}</option>`;
    }
}

// 顯示模型資訊
function showModelInfo() {
    const select = document.getElementById('model-select');
    const panel = document.getElementById('model-info-panel');
    const selectedId = select.value;

    const model = modelsData.find(m => m.id === selectedId);

    if (model && model.info) {
        const info = model.info;
        panel.style.display = 'block';
        panel.innerHTML = `
            <div class="model-info-header">
                <span class="model-info-name">${info.name}</span>
                <span class="model-info-context">${info.context_length}</span>
            </div>
            <div class="model-info-description">${info.description}</div>
            <div class="model-info-features">
                ${info.features.map(f => `<span class="model-info-feature">${f}</span>`).join('')}
            </div>
            <div class="model-info-best">
                <strong>最適合：</strong>${info.best_for}
            </div>
        `;
    } else {
        panel.style.display = 'none';
    }

    // 檢查是否為視覺模型，顯示/隱藏圖片上傳區域
    const imageSection = document.getElementById('image-upload-section');
    if (imageSection) {
        imageSection.style.display = isVisionCapable(model) ? 'block' : 'none';
    }
}

// 偵測模型是否支援視覺（從 features / id / family 多重判斷）
function isVisionCapable(model) {
    if (!model) return false;
    const id = (model.id || '').toLowerCase();
    if (/\b(vl|vision|llava|omni|mllama|pixtral|paligemma|qwen2\.5-vl|qwen3-vl|gemma3|gemma4|nemotron3)\b/.test(id)) return true;
    const info = model.info || {};
    const blob = (
        (info.features || []).join(' ') + ' ' +
        (info.description || '') + ' ' +
        (info.name || '')
    ).toLowerCase();
    return /視覺|多模態|影像|圖文|mmproj|vision|multimodal|image\s*input|omni/.test(blob);
}

// 儲存上傳的圖片 Base64

// 處理圖片選擇
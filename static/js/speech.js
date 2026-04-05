// ==========================================================================
// SPEECH MODULE
// ==========================================================================

async function toggleMicRecording() {
    const micBtn = document.getElementById('mic-btn');
    const micStatus = document.getElementById('mic-status');
    const micTimer = document.getElementById('mic-timer');
    const waveform = document.getElementById('mic-waveform');

    if (micBtn.classList.contains('processing')) {
        return; // 處理中，不允許操作
    }

    if (!isRecording) {
        // 開始錄音
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                // 停止所有音軌
                stream.getTracks().forEach(track => track.stop());

                // 創建音訊 Blob
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                lastRecordedBlob = audioBlob; // 保存錄音

                // 顯示音頻播放器
                showAudioPlayer(audioBlob);

                // 處理錄音
                await processRecordedAudio(audioBlob);
            };

            mediaRecorder.start();
            isRecording = true;
            recordingSeconds = 0;

            micBtn.classList.add('recording');
            micStatus.textContent = '錄音中... 點擊停止';
            micStatus.style.color = '#ff4757';
            micTimer.style.display = 'block';
            waveform.style.display = 'flex';

            // 開始計時
            recordingTimer = setInterval(() => {
                recordingSeconds++;
                const mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
                const secs = (recordingSeconds % 60).toString().padStart(2, '0');
                micTimer.textContent = `${mins}:${secs}`;
            }, 1000);

        } catch (error) {
            console.error('無法存取麥克風:', error);
            alert('無法存取麥克風，請確認瀏覽器已授權麥克風權限');
        }
    } else {
        // 停止錄音
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;

        // 停止計時
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }

        micBtn.classList.remove('recording');
        micBtn.classList.add('processing');
        micStatus.textContent = '處理中...';
        micStatus.style.color = '#ffa502';
        waveform.style.display = 'none';
    }
}

// 處理錄製的音訊
async function processRecordedAudio(audioBlob) {
    const micBtn = document.getElementById('mic-btn');
    const micStatus = document.getElementById('mic-status');
    const micTimer = document.getElementById('mic-timer');
    const resultContainer = document.getElementById('mic-result-container');
    const resultDiv = document.getElementById('mic-result');
    const resultStatus = document.getElementById('mic-result-status');
    const resultTime = document.getElementById('mic-result-time');
    const translateContainer = document.getElementById('mic-translate-container');
    const translateResult = document.getElementById('mic-translate-result');
    const translateLang = document.getElementById('mic-translate-lang');

    const enableTranslate = document.getElementById('mic-enable-translate').checked;
    const targetLanguage = document.getElementById('mic-target-language').value;

    resultContainer.style.display = 'block';
    translateContainer.style.display = 'none';
    resultStatus.textContent = '處理中...';
    resultStatus.classList.add('streaming');
    resultDiv.innerHTML = '<div class="vision-notice"><div class="notice-icon">🎙️</div><div class="notice-text"><strong>語音轉文字處理中</strong><br>正在分析錄音內容，請稍候...</div></div>';

    const startTime = Date.now();

    try {
        const formData = new FormData();
        // 將 webm 轉成 wav 格式的檔名
        formData.append('file', audioBlob, 'recording.webm');

        let apiUrl = `${API_URL}/v1/audio/transcriptions`;
        if (enableTranslate) {
            apiUrl = `${API_URL}/v1/audio/transcribe-and-translate?target_language=${targetLanguage}&model=deepseek-chat`;
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentApiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const elapsed = Date.now() - startTime;

        resultStatus.textContent = enableTranslate ? '轉錄+翻譯完成' : '轉錄完成';
        resultStatus.classList.remove('streaming');
        resultTime.textContent = `${(elapsed / 1000).toFixed(1)}s`;

        // 顯示轉錄結果
        const originalText = enableTranslate ? data.original_text : data.text;
        if (originalText) {
            lastMicResult = originalText;
            resultDiv.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(originalText)}</div>`;
        } else if (originalText === '') {
            lastMicResult = '';
            resultDiv.innerHTML = `<div style="color: #6c757d; text-align: center; padding: 20px;">🔇 未偵測到語音內容</div>`;
        } else {
            lastMicResult = JSON.stringify(data, null, 2);
            resultDiv.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        }

        // 如果啟用翻譯，顯示翻譯結果
        if (enableTranslate && data.translated_text) {
            lastMicTranslate = data.translated_text;
            translateContainer.style.display = 'block';
            translateLang.textContent = data.target_language_name || targetLanguage;
            translateResult.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(data.translated_text)}</div>`;
        } else if (enableTranslate && data.message) {
            translateContainer.style.display = 'block';
            translateLang.textContent = '';
            translateResult.innerHTML = `<div style="color: #6c757d; text-align: center; padding: 20px;">${escapeHtml(data.message)}</div>`;
        }

    } catch (error) {
        resultStatus.textContent = '轉錄失敗';
        resultStatus.classList.remove('streaming');
        resultDiv.innerHTML = `<div style="color: #dc3545;">❌ 錯誤: ${escapeHtml(error.message)}</div>`;
    } finally {
        // 重置按鈕狀態
        micBtn.classList.remove('processing');
        micStatus.textContent = '點擊開始錄音';
        micStatus.style.color = '#6c757d';
        micTimer.style.display = 'none';
        micTimer.textContent = '00:00';
    }
}

// 複製麥克風轉錄結果
function copyMicResult() {
    if (lastMicResult) {
        navigator.clipboard.writeText(lastMicResult).then(() => {
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ 已複製';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }
}

// 複製麥克風翻譯結果
function copyMicTranslate() {
    if (lastMicTranslate) {
        navigator.clipboard.writeText(lastMicTranslate).then(() => {
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ 已複製';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }
}

// 顯示音頻播放器
function showAudioPlayer(audioBlob) {
    const container = document.getElementById('mic-audio-container');
    const player = document.getElementById('mic-audio-player');
    const durationSpan = document.getElementById('mic-audio-duration');

    // 創建音頻 URL
    const audioUrl = URL.createObjectURL(audioBlob);
    player.src = audioUrl;

    // 顯示容器
    container.style.display = 'block';

    // 載入後顯示時長
    player.onloadedmetadata = () => {
        const duration = player.duration;
        const mins = Math.floor(duration / 60).toString().padStart(2, '0');
        const secs = Math.floor(duration % 60).toString().padStart(2, '0');
        durationSpan.textContent = `時長: ${mins}:${secs}`;
    };
}

// 重新轉錄錄音
async function reTranscribeRecording() {
    if (!lastRecordedBlob) {
        alert('沒有可用的錄音');
        return;
    }
    await processRecordedAudio(lastRecordedBlob);
}

// 清除錄音
function clearRecording() {
    lastRecordedBlob = null;
    lastMicResult = '';
    lastMicTranslate = '';

    // 隱藏音頻播放器
    const audioContainer = document.getElementById('mic-audio-container');
    const player = document.getElementById('mic-audio-player');
    audioContainer.style.display = 'none';
    player.src = '';

    // 隱藏結果容器
    document.getElementById('mic-result-container').style.display = 'none';
    document.getElementById('mic-translate-container').style.display = 'none';
}

// 麥克風翻譯選項切換
document.addEventListener('DOMContentLoaded', function() {
    const micEnableTranslate = document.getElementById('mic-enable-translate');
    const micLangContainer = document.getElementById('mic-translate-lang-container');
    if (micEnableTranslate && micLangContainer) {
        micEnableTranslate.addEventListener('change', function() {
            micLangContainer.style.display = this.checked ? 'flex' : 'none';
        });
    }
});

// ===== 視覺模型功能 =====

// 處理視覺模型圖片選擇
function handleAudioSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleAudioFile(file);
    }
}

function handleAudioFile(file) {
    if (!file.type.startsWith('audio/')) {
        alert('請選擇音訊檔案');
        return;
    }

    if (file.size > 50 * 1024 * 1024) {
        alert('音訊檔案大小不能超過 50MB');
        return;
    }

    uploadedAudioFile = file;

    const placeholder = document.getElementById('audio-upload-placeholder');
    const fileInfo = document.getElementById('audio-file-info');
    const fileName = document.getElementById('audio-file-name');
    const fileSize = document.getElementById('audio-file-size');
    const removeBtn = document.getElementById('remove-audio-btn');

    placeholder.style.display = 'none';
    fileInfo.style.display = 'block';
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    removeBtn.style.display = 'inline-block';
}

function removeAudio() {
    uploadedAudioFile = null;
    const placeholder = document.getElementById('audio-upload-placeholder');
    const fileInfo = document.getElementById('audio-file-info');
    const removeBtn = document.getElementById('remove-audio-btn');
    const input = document.getElementById('audio-input');

    placeholder.style.display = 'flex';
    fileInfo.style.display = 'none';
    removeBtn.style.display = 'none';
    input.value = '';
}

async function testSpeechToText() {
    if (!uploadedAudioFile) {
        alert('請先選擇音訊檔案');
        return;
    }

    const container = document.getElementById('speech-result-container');
    const result = document.getElementById('speech-result');
    const status = document.getElementById('speech-status');
    const timeSpan = document.getElementById('speech-time');
    const translateContainer = document.getElementById('translate-result-container');
    const translateResult = document.getElementById('translate-result');
    const translateTargetLang = document.getElementById('translate-target-lang');

    const enableTranslate = document.getElementById('enable-translate').checked;
    const targetLanguage = document.getElementById('target-language').value;

    container.style.display = 'block';
    translateContainer.style.display = 'none';
    status.textContent = '處理中...';
    status.classList.add('streaming');
    result.innerHTML = '<div class="vision-notice"><div class="notice-icon">🎤</div><div class="notice-text"><strong>語音轉文字處理中</strong><br>正在分析音訊內容，請稍候...</div></div>';
    timeSpan.textContent = '';

    const startTime = Date.now();

    try {
        const formData = new FormData();
        formData.append('file', uploadedAudioFile);

        // 如果啟用翻譯，使用 transcribe-and-translate API
        let apiUrl = `${API_URL}/v1/audio/transcriptions`;
        if (enableTranslate) {
            apiUrl = `${API_URL}/v1/audio/transcribe-and-translate?target_language=${targetLanguage}&model=deepseek-chat`;
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentApiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const elapsed = Date.now() - startTime;

        status.textContent = enableTranslate ? '轉錄+翻譯完成' : '轉錄完成';
        status.classList.remove('streaming');
        timeSpan.textContent = `${(elapsed / 1000).toFixed(1)}s`;

        // 顯示轉錄結果
        const originalText = enableTranslate ? data.original_text : data.text;
        if (originalText) {
            lastSpeechResult = originalText;
            result.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(originalText)}</div>`;
        } else if (originalText === '') {
            lastSpeechResult = '';
            result.innerHTML = `<div style="color: #6c757d; text-align: center; padding: 20px;">🔇 未偵測到語音內容</div>`;
        } else {
            lastSpeechResult = JSON.stringify(data, null, 2);
            result.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        }

        // 如果啟用翻譯，顯示翻譯結果
        if (enableTranslate && data.translated_text) {
            lastTranslateResult = data.translated_text;
            translateContainer.style.display = 'block';
            translateTargetLang.textContent = data.target_language_name || targetLanguage;
            translateResult.innerHTML = `<div style="white-space: pre-wrap; line-height: 1.8;">${escapeHtml(data.translated_text)}</div>`;
        } else if (enableTranslate && data.message) {
            translateContainer.style.display = 'block';
            translateTargetLang.textContent = '';
            translateResult.innerHTML = `<div style="color: #6c757d; text-align: center; padding: 20px;">${escapeHtml(data.message)}</div>`;
        }

    } catch (error) {
        status.textContent = '轉錄失敗';
        status.classList.remove('streaming');
        result.innerHTML = `<div style="color: #dc3545;">❌ 錯誤: ${escapeHtml(error.message)}</div>`;
    }
}

// 儲存最後的語音轉錄結果

// 複製語音轉錄結果
function copySpeechResult() {
    if (lastSpeechResult) {
        navigator.clipboard.writeText(lastSpeechResult).then(() => {
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ 已複製';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }
}

// 複製翻譯結果
function copyTranslateResult() {
    if (lastTranslateResult) {
        navigator.clipboard.writeText(lastTranslateResult).then(() => {
            const btn = event.target;
            const originalText = btn.textContent;
            btn.textContent = '✅ 已複製';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        });
    }
}

// ===== 模型快速測試功能 =====
let isTestingAll = false;

// Provider 引導資訊
const providerGuides = {
    "llama.cpp": {
        label: "地端 llama.cpp",
        badgeClass: "local",
        color: "#10b981",
        guide: "本地 llama.cpp 伺服器",
        endpoint: `${window.location.origin}/v1`,
        link: null,
        linkText: null
    },
    "Ollama": {
        label: "地端 Ollama",
        badgeClass: "local",
        color: "#10b981",
        guide: "本地 Ollama 伺服器",
        endpoint: `${window.location.origin}/v1`,
        link: null,
        linkText: null
    },
    "DeepSeek": {
        label: "DeepSeek 雲端",
        badgeClass: "deepseek",
        color: "#3b82f6",
        guide: "DeepSeek 雲端 API",
        endpoint: "https://api.deepseek.com/v1",
        link: "https://platform.deepseek.com/api_keys",
        linkText: "前往 DeepSeek 申請 API Key"
    },
};

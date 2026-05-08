// ==========================================================================
// APP - Global state & initialization
// ----------------------------------------------------------------------------
// NOTE: Shared state has been moved into AppStore (store.js). The `let` bindings
//   below are kept as backward-compatibility aliases — old code that reads
//   `currentApiKey` / `modelsData` / etc still works. Writes should go through
//   AppStore.set('apiKey', value) so subscribers (UI, status badge) update.
// ==========================================================================

const API_URL = window.location.origin;
// 外網 URL（用於提示詞複製、文檔顯示）
const EXTERNAL_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://ollama_pjapi.theaken.com'
    : window.location.origin;

// Pagination
let currentPage = 0;
const pageSize = 10;

// ---- Auth (mirrored to AppStore) ----
let currentApiKey = (window.AppStore ? AppStore.get('apiKey') : (localStorage.getItem('pj_api_key') || ''));
let currentUser   = (window.AppStore ? AppStore.get('user')   : JSON.parse(localStorage.getItem('pj_user') || 'null'));
let currentRole   = (window.AppStore ? AppStore.get('role')   : (localStorage.getItem('pj_role') || null));
let isAuthenticated = (window.AppStore ? AppStore.get('isAuthenticated') : (localStorage.getItem('pj_authenticated') === 'true'));

// Auto-refresh
let autoRefreshEnabled = true;
let autoRefreshInterval = null;

// ---- Models (mirrored to AppStore) ----
let modelsData = (window.AppStore ? AppStore.get('models') : []);

// ---- Image upload (mirrored to AppStore) ----
let uploadedImageBase64 = (window.AppStore ? AppStore.get('uploadedImage') : null);

// Microphone / recording
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingTimer = null;
let recordingSeconds = 0;
let lastMicResult = '';
let lastMicTranslate = '';
let lastRecordedBlob = null;

// ---- Vision (mirrored to AppStore) ----
let visionImageBase64 = (window.AppStore ? AppStore.get('visionImage') : null);
let lastVisionResult  = (window.AppStore ? AppStore.get('lastVisionResult') : '');

// ---- AppStore subscriptions: keep `let` aliases in sync when other code
//      writes via AppStore.set(...). One-way: AppStore → let mirror.
//      Writes from old code that mutate the let directly will NOT propagate
//      to AppStore — those callers should be migrated to use AppStore.set.
if (window.AppStore) {
    AppStore.subscribe('apiKey',           v => { currentApiKey = v; });
    AppStore.subscribe('user',             v => { currentUser = v; });
    AppStore.subscribe('role',             v => { currentRole = v; });
    AppStore.subscribe('isAuthenticated',  v => { isAuthenticated = v; });
    AppStore.subscribe('models',           v => { modelsData = v; });
    AppStore.subscribe('uploadedImage',    v => { uploadedImageBase64 = v; });
    AppStore.subscribe('visionImage',      v => { visionImageBase64 = v; });
    AppStore.subscribe('lastVisionResult', v => { lastVisionResult = v; });
    AppStore.subscribe('quickTestModels',  v => { quickTestModels = v; });
    // lastRawResponse / lastAIContent are declared inside testing.js (file-local).
    // Writers in testing.js call AppStore.set for debug visibility but app.js does
    // not mirror them since nothing else in the codebase reads them externally.
}

// History
const HISTORY_PASSWORD = '1023';
let historyAuthenticated = false;
let historyCurrentPage = 0;
const historyPageSize = 10;

// Audio upload
let uploadedAudioFile = null;
let lastTranslateResult = '';
let lastSpeechResult = '';

// Quick test (mirrored to AppStore.quickTestModels)
let quickTestModels = (window.AppStore ? AppStore.get('quickTestModels') : []);

// OCR
let ocrResultData = null;

// Health status
let endpoint_health = {};
let deepseek_health = false;
let qwen_vl_health = false;
let ocr_api_health = false;
let deepseek_ocr_health = false;

// Service config for dashboard
const serviceConfig = {
    'Endpoint-21180': { icon: 'server', type: 'ollama', name: 'Ollama 21180', desc: 'LLM 推理服務', model: 'gpt-oss:120b' },
    'Endpoint-21181': { icon: 'gem', type: 'ollama', name: 'Gemma4 31B', desc: '多模態推理服務', model: 'gemma4:31b' },
    'Endpoint-21182': { icon: 'server', type: 'ollama', name: 'Ollama 21182', desc: 'Embedding 服務', model: 'Qwen3-Embedding-8B' },
    'Endpoint-21183': { icon: 'server', type: 'ollama', name: 'Ollama 21183', desc: 'Reranker 服務', model: 'bge-reranker-v2-m3' },
    'Endpoint-21185': { icon: 'brain', type: 'ollama', name: 'Qwen3.5 122B', desc: 'MoE 推理服務', model: 'Qwen3.5:122b' },
    'DeepSeek-pj': { icon: 'brain', type: 'deepseek', name: 'DeepSeek API', desc: '雲端 AI 服務' },
    'LLaVA-Local': { icon: 'eye', type: 'vision', name: 'LLaVA 視覺', desc: '本地視覺模型' },
    'OCR-Service': { icon: 'camera', type: 'ocr', name: 'PP-OCR', desc: '文字辨識服務' },
    'DeepSeek-OCR': { icon: 'sparkles', type: 'deepseek-ocr', name: 'DeepSeek OCR', desc: 'GPU 加速 OCR' },
};

// Lucide icons helper - call after dynamically inserting HTML with data-lucide attributes
function refreshIcons() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Helper to render a Lucide icon as HTML string (for dynamic innerHTML)
function lucideIcon(name, cls) {
    return `<i data-lucide="${name}" class="${cls || 'icon-sm'}"></i>`;
}

// Initialization - hide login immediately if session exists, then verify async
window.addEventListener('load', () => {
    if (isAuthenticated && currentApiKey) {
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.add('visible');
    }
    checkAuth();
    refreshIcons();
});

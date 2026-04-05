// ==========================================================================
// APP - Global state & initialization
// ==========================================================================

const API_URL = window.location.origin;
// 外網 URL（用於提示詞複製、文檔顯示）
const EXTERNAL_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://ollama_pjapi.theaken.com'
    : window.location.origin;

// Pagination
let currentPage = 0;
const pageSize = 10;

// Authentication
let currentApiKey = localStorage.getItem('pj_api_key') || '';
let currentUser = JSON.parse(localStorage.getItem('pj_user') || 'null');
let currentRole = localStorage.getItem('pj_role') || null;
let isAuthenticated = localStorage.getItem('pj_authenticated') === 'true';

// Auto-refresh
let autoRefreshEnabled = true;
let autoRefreshInterval = null;

// Models
let modelsData = [];

// Image upload
let uploadedImageBase64 = null;

// Microphone / recording
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingTimer = null;
let recordingSeconds = 0;
let lastMicResult = '';
let lastMicTranslate = '';
let lastRecordedBlob = null;

// Vision
let visionImageBase64 = null;
let lastVisionResult = '';

// History
const HISTORY_PASSWORD = '1023';
let historyAuthenticated = false;
let historyCurrentPage = 0;
const historyPageSize = 10;

// Audio upload
let uploadedAudioFile = null;
let lastTranslateResult = '';
let lastSpeechResult = '';

// Quick test
let quickTestModels = [];

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
    'Endpoint-21180': { icon: '\u{1F999}', type: 'ollama', name: 'Ollama 21180', desc: 'LLM 推理服務', model: 'gpt-oss:120b' },
    'Endpoint-21181': { icon: '\u{1F48E}', type: 'ollama', name: 'Gemma4 31B', desc: '多模態推理服務', model: 'gemma4:31b' },
    'Endpoint-21182': { icon: '\u{1F999}', type: 'ollama', name: 'Ollama 21182', desc: 'Embedding 服務', model: 'Qwen3-Embedding-8B' },
    'Endpoint-21183': { icon: '\u{1F999}', type: 'ollama', name: 'Ollama 21183', desc: 'Reranker 服務', model: 'bge-reranker-v2-m3' },
    'Endpoint-21185': { icon: '\u{1F9E0}', type: 'ollama', name: 'Qwen3.5 122B', desc: 'MoE 推理服務', model: 'Qwen3.5:122b' },
    'DeepSeek-pj': { icon: '\u{1F9E0}', type: 'deepseek', name: 'DeepSeek API', desc: '雲端 AI 服務' },
    'LLaVA-Local': { icon: '\u{1F441}\u{FE0F}', type: 'vision', name: 'LLaVA 視覺', desc: '本地視覺模型' },
    'OCR-Service': { icon: '\u{1F4F7}', type: 'ocr', name: 'PP-OCR', desc: '文字辨識服務' },
    'DeepSeek-OCR': { icon: '\u{1F52E}', type: 'deepseek-ocr', name: 'DeepSeek OCR', desc: 'GPU 加速 OCR' },
};

// Initialization - only check auth on load, data loading happens in showMainContent()
window.addEventListener('load', () => {
    checkAuth();
});

# Ollama API Gateway

統一的 Ollama 模型 API 接口服務，提供負載均衡、健康檢查和自動故障轉移功能。

## 功能特點

- ✅ **負載均衡**: 在多個 Ollama 端點間智能分配請求
- ✅ **健康檢查**: 定期檢查端點狀態，自動排除故障節點
- ✅ **自動重試**: 請求失敗時自動切換到其他可用端點
- ✅ **OpenAI 兼容**: 完全兼容 OpenAI API 格式
- ✅ **串流支援**: 支援即時串流回應
- ✅ **Web 界面**: 內建測試和監控介面

## 快速開始

### 1. 安裝依賴

```bash
pip install -r requirements.txt
```

### 2. 啟動服務

Windows:
```bash
start_server.bat
```

或手動啟動:
```bash
python ollama_api_server.py
```

### 3. 訪問服務

- **Web 界面**: http://localhost:8000
- **API 端點**: http://localhost:8000/v1/...

## API 端點

| 端點 | 方法 | 描述 |
|------|------|------|
| `/` | GET | Web 管理介面 |
| `/health` | GET | 健康檢查 |
| `/v1/models` | GET | 列出可用模型 |
| `/v1/chat/completions` | POST | 聊天完成（支援串流） |
| `/v1/completions` | POST | 文本完成 |

## 配置說明

在 `ollama_api_server.py` 中修改以下設定:

```python
# Ollama 端點列表
OLLAMA_ENDPOINTS = [
    "http://192.168.0.6:21180/v1",
    "http://192.168.0.6:21182/v1",
    "http://192.168.0.6:21183/v1",
    "http://192.168.0.6:21185/v1"
]

# API Key
API_KEY = "your-api-key-here"
```

## 測試工具

### 1. 測試連接狀態
```bash
python test_connection.py
```

### 2. 測試 API 功能
```bash
python test_api_client.py
```

## 使用範例

### Python
```python
import requests

response = requests.post(
    "http://localhost:8000/v1/chat/completions",
    json={
        "model": "qwen2.5:3b",
        "messages": [
            {"role": "user", "content": "Hello!"}
        ]
    }
)
print(response.json())
```

### cURL
```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:3b",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 檔案說明

- `ollama_api_server.py` - 主要 API 服務程式
- `test_connection.py` - 測試 Ollama 端點連接
- `test_api_client.py` - API 功能測試工具
- `index.html` - Web 管理介面
- `requirements.txt` - Python 依賴套件
- `start_server.bat` - Windows 快速啟動腳本

## 注意事項

1. 確保 Ollama 服務正在運行
2. 檢查防火牆設定允許連接到 Ollama 端點
3. 服務預設運行在 8000 端口，可在啟動時修改

## 支援的模型

根據您的 Ollama 安裝，可能包括:
- qwen2.5:3b
- qwen2.5:7b  
- llama3.2:3b
- 其他已安裝的 Ollama 模型
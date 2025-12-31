import requests
import json
import time

# API Gateway URL (will run on localhost:8000)
API_BASE_URL = "http://localhost:8000"

def test_health_check():
    """Test health check endpoint"""
    print("Testing health check...")
    response = requests.get(f"{API_BASE_URL}/health")
    if response.status_code == 200:
        print("[OK] Health check passed")
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"[ERROR] Health check failed: {response.status_code}")

def test_list_models():
    """Test list models endpoint"""
    print("\nTesting list models...")
    response = requests.get(f"{API_BASE_URL}/v1/models")
    if response.status_code == 200:
        data = response.json()
        print(f"[OK] Found {len(data.get('data', []))} models")
        for model in data.get('data', [])[:3]:  # Show first 3 models
            print(f"  - {model.get('id', 'unknown')}")
    else:
        print(f"[ERROR] List models failed: {response.status_code}")

def test_chat_completion():
    """Test chat completion endpoint"""
    print("\nTesting chat completion...")
    
    payload = {
        "model": "qwen2.5:3b",  # Using a common model
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Say 'Hello, World!' in Chinese"}
        ],
        "temperature": 0.7,
        "max_tokens": 50
    }
    
    response = requests.post(
        f"{API_BASE_URL}/v1/chat/completions",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    
    if response.status_code == 200:
        data = response.json()
        print("[OK] Chat completion successful")
        if 'choices' in data and len(data['choices']) > 0:
            print(f"Response: {data['choices'][0]['message']['content']}")
    else:
        print(f"[ERROR] Chat completion failed: {response.status_code}")
        print(response.text)

def test_streaming_chat():
    """Test streaming chat completion"""
    print("\nTesting streaming chat completion...")
    
    payload = {
        "model": "qwen2.5:3b",
        "messages": [
            {"role": "user", "content": "Count from 1 to 5"}
        ],
        "stream": True,
        "temperature": 0.5
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/v1/chat/completions",
            json=payload,
            headers={"Content-Type": "application/json"},
            stream=True
        )
        
        if response.status_code == 200:
            print("[OK] Streaming chat completion started")
            print("Stream content: ", end="")
            for line in response.iter_lines():
                if line:
                    try:
                        # Parse SSE data
                        if line.startswith(b"data: "):
                            data_str = line[6:].decode('utf-8')
                            if data_str.strip() == "[DONE]":
                                break
                            data = json.loads(data_str)
                            if 'choices' in data and len(data['choices']) > 0:
                                delta = data['choices'][0].get('delta', {})
                                if 'content' in delta:
                                    print(delta['content'], end="", flush=True)
                    except json.JSONDecodeError:
                        pass
            print("\n[OK] Streaming completed")
        else:
            print(f"[ERROR] Streaming failed: {response.status_code}")
    except Exception as e:
        print(f"[ERROR] Streaming error: {str(e)}")

def main():
    print("=" * 60)
    print("Ollama API Gateway Test Suite")
    print("=" * 60)
    
    # Wait a moment for the server to be ready
    print("\nMake sure the API server is running (python ollama_api_server.py)")
    print("Testing will begin in 3 seconds...")
    time.sleep(3)
    
    try:
        # Run tests
        test_health_check()
        test_list_models()
        test_chat_completion()
        test_streaming_chat()
        
        print("\n" + "=" * 60)
        print("All tests completed!")
        print("=" * 60)
        
    except requests.exceptions.ConnectionError:
        print("\n[ERROR] Cannot connect to API server at", API_BASE_URL)
        print("Please make sure the server is running: python ollama_api_server.py")

if __name__ == "__main__":
    main()
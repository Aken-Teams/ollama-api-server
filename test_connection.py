import requests
import json
from typing import List, Dict

# Ollama endpoints
ENDPOINTS = [
    "http://192.168.31.156:21180/v1",
    "http://192.168.31.156:21182/v1",
    "http://192.168.31.156:21183/v1",
]

API_KEY = "paVrIT+XU1NhwCAOb0X4aYi75QKogK5YNMGvQF1dCyo="

def test_endpoint(endpoint: str) -> Dict:
    """Test if an Ollama endpoint is available"""
    try:
        # Test models endpoint
        response = requests.get(
            f"{endpoint}/models",
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=5
        )
        
        if response.status_code == 200:
            models = response.json()
            return {
                "status": "online",
                "models": models.get("data", []) if isinstance(models, dict) else models,
                "endpoint": endpoint
            }
        else:
            return {
                "status": "error",
                "code": response.status_code,
                "endpoint": endpoint
            }
    except requests.exceptions.RequestException as e:
        return {
            "status": "offline",
            "error": str(e),
            "endpoint": endpoint
        }

def main():
    print("Testing Ollama endpoints...")
    print("-" * 50)
    
    available_endpoints = []
    
    for endpoint in ENDPOINTS:
        print(f"\nTesting {endpoint}...")
        result = test_endpoint(endpoint)
        
        if result["status"] == "online":
            print(f"[OK] Online - Models found: {len(result.get('models', []))}")
            available_endpoints.append(result)
        elif result["status"] == "error":
            print(f"[ERROR] Error - Status code: {result['code']}")
        else:
            print(f"[OFFLINE] Offline - {result.get('error', 'Unknown error')}")
    
    print("\n" + "-" * 50)
    print(f"Summary: {len(available_endpoints)} endpoints available out of {len(ENDPOINTS)}")
    
    return available_endpoints

if __name__ == "__main__":
    available = main()
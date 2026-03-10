#!/usr/bin/env python3
"""
Test script for all OCR models in the Ollama API Server
Tests: llava-ocr, pp-ocrv5, general-ocr, table-ocr, invoice-ocr, deepseek-ocr
"""

import requests
import json
import time
import os
import io
import sys

# API Configuration
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8777")
API_KEY = os.environ.get("API_KEY", "pj-admin-zhpjaiaoi-2024")  # Master API key

# All available OCR models
OCR_MODELS = [
    "llava-ocr",
    "pp-ocrv5",
    "general-ocr",
    "table-ocr",
    "invoice-ocr",
    "deepseek-ocr"
]

def get_headers():
    """Get authorization headers"""
    return {
        "Authorization": f"Bearer {API_KEY}"
    }

def create_test_image():
    """Create a simple test image with text using PIL if available, otherwise use a placeholder"""
    try:
        from PIL import Image, ImageDraw, ImageFont

        # Create image with white background
        img = Image.new('RGB', (800, 400), color='white')
        draw = ImageDraw.Draw(img)

        # Try to use a font that supports Chinese, fall back to default
        try:
            # Try common Chinese fonts on Linux
            font_paths = [
                "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/TTF/DejaVuSans.ttf"
            ]
            font = None
            for path in font_paths:
                if os.path.exists(path):
                    font = ImageFont.truetype(path, 32)
                    break
            if font is None:
                font = ImageFont.load_default()
        except:
            font = ImageFont.load_default()

        # Draw text
        test_texts = [
            "OCR Test Image",
            "Hello World! 123456789",
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            "abcdefghijklmnopqrstuvwxyz",
            "!@#$%^&*()_+-=[]{}|;':\",./<>?",
        ]

        y_pos = 30
        for text in test_texts:
            draw.text((50, y_pos), text, fill='black', font=font)
            y_pos += 60

        # Save to bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)

        print("[OK] Created test image with PIL")
        return img_bytes.getvalue(), "test_image.png"

    except ImportError:
        print("[INFO] PIL not available, using minimal PNG")
        # Create a minimal valid PNG with embedded text pattern
        # This is a 1x1 white pixel PNG - models may not be able to read it well
        # but it will test if the API is working
        minimal_png = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 dimension
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0xFF,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        return minimal_png, "minimal_test.png"


def test_ocr_health():
    """Test OCR health endpoint"""
    print("\n" + "=" * 60)
    print("Testing OCR Health...")
    print("=" * 60)

    try:
        response = requests.get(
            f"{API_BASE_URL}/v1/ocr/health",
            headers=get_headers(),
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()
            print(f"[OK] OCR Health Check Passed")
            print(f"  PP-OCR Service: {data.get('pp_ocr_service', 'unknown')}")
            print(f"  DeepSeek OCR:   {data.get('deepseek_ocr', 'unknown')}")
            print(f"  LLaVA Local:    {data.get('llava_local', 'unknown')}")
            return data
        else:
            print(f"[ERROR] OCR Health check failed: {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            return None

    except requests.exceptions.ConnectionError:
        print(f"[ERROR] Cannot connect to {API_BASE_URL}")
        print("  Please make sure the server is running")
        return None
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        return None


def test_ocr_models_list():
    """Test OCR models list endpoint"""
    print("\n" + "=" * 60)
    print("Testing OCR Models List...")
    print("=" * 60)

    try:
        response = requests.get(
            f"{API_BASE_URL}/v1/ocr/models",
            headers=get_headers(),
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()
            models = data.get('models', [])
            print(f"[OK] Found {len(models)} OCR models:")
            for model in models:
                print(f"  - {model.get('id', 'unknown')}: {model.get('name', 'unknown')}")
                print(f"    Type: {model.get('type', 'unknown')}")
                print(f"    Description: {model.get('description', 'N/A')[:50]}...")
            return models
        else:
            print(f"[ERROR] List models failed: {response.status_code}")
            return []

    except Exception as e:
        print(f"[ERROR] {str(e)}")
        return []


def test_single_ocr_model(model_name: str, image_data: bytes, filename: str):
    """Test a single OCR model"""
    print(f"\n  Testing {model_name}...")

    try:
        start_time = time.time()

        files = {
            'file': (filename, image_data, 'image/png')
        }
        data = {
            'model': model_name,
            'output_format': 'text',
            'language': 'auto'
        }

        response = requests.post(
            f"{API_BASE_URL}/v1/ocr/recognize",
            headers=get_headers(),
            files=files,
            data=data,
            timeout=120  # 2 minute timeout for OCR
        )

        elapsed_time = time.time() - start_time

        if response.status_code == 200:
            result = response.json()
            text = result.get('text', '')
            confidence = result.get('confidence', 0)

            # Truncate text for display
            display_text = text[:100] + "..." if len(text) > 100 else text
            display_text = display_text.replace('\n', ' ')

            print(f"    [OK] Success in {elapsed_time:.2f}s")
            print(f"    Confidence: {confidence:.2%}")
            print(f"    Text: {display_text if display_text else '(empty)'}")

            return {
                "model": model_name,
                "status": "success",
                "time": elapsed_time,
                "confidence": confidence,
                "text_length": len(text),
                "text_preview": display_text
            }
        elif response.status_code == 503:
            print(f"    [SKIP] Service unavailable")
            return {
                "model": model_name,
                "status": "unavailable",
                "time": elapsed_time,
                "error": "Service unavailable"
            }
        else:
            error_detail = response.text[:200]
            print(f"    [ERROR] Failed with status {response.status_code}")
            print(f"    Detail: {error_detail}")
            return {
                "model": model_name,
                "status": "error",
                "time": elapsed_time,
                "error": error_detail
            }

    except requests.exceptions.Timeout:
        print(f"    [TIMEOUT] Request timed out after 120s")
        return {
            "model": model_name,
            "status": "timeout",
            "time": 120,
            "error": "Request timed out"
        }
    except Exception as e:
        print(f"    [ERROR] {str(e)}")
        return {
            "model": model_name,
            "status": "error",
            "time": 0,
            "error": str(e)
        }


def test_all_ocr_models():
    """Test all OCR models"""
    print("\n" + "=" * 60)
    print("Testing All OCR Models...")
    print("=" * 60)

    # Create test image
    image_data, filename = create_test_image()

    results = []

    for model in OCR_MODELS:
        result = test_single_ocr_model(model, image_data, filename)
        results.append(result)

    return results


def print_summary(results):
    """Print test summary"""
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    success_count = sum(1 for r in results if r.get("status") == "success")
    unavailable_count = sum(1 for r in results if r.get("status") == "unavailable")
    error_count = sum(1 for r in results if r.get("status") in ["error", "timeout"])

    print(f"\nTotal Models Tested: {len(results)}")
    print(f"  Successful: {success_count}")
    print(f"  Unavailable: {unavailable_count}")
    print(f"  Errors/Timeouts: {error_count}")

    print("\nDetailed Results:")
    print("-" * 60)

    for result in results:
        model = result.get("model", "unknown")
        status = result.get("status", "unknown")
        time_taken = result.get("time", 0)

        if status == "success":
            confidence = result.get("confidence", 0)
            text_len = result.get("text_length", 0)
            print(f"  {model:15} | OK     | {time_taken:6.2f}s | conf: {confidence:.0%} | {text_len} chars")
        elif status == "unavailable":
            print(f"  {model:15} | SKIP   | Service unavailable")
        else:
            error = result.get("error", "Unknown error")[:30]
            print(f"  {model:15} | FAIL   | {error}")

    print("-" * 60)

    return success_count > 0


def main():
    print("=" * 60)
    print("OCR Models Test Suite")
    print(f"API URL: {API_BASE_URL}")
    print("=" * 60)

    # Test 1: Health check
    health = test_ocr_health()

    # Test 2: List models
    models = test_ocr_models_list()

    # Test 3: Test all models
    results = test_all_ocr_models()

    # Summary
    success = print_summary(results)

    if success:
        print("\n[PASS] At least one OCR model is working correctly!")
        sys.exit(0)
    else:
        print("\n[FAIL] No OCR models passed the test")
        sys.exit(1)


if __name__ == "__main__":
    main()

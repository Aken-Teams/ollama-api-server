#!/usr/bin/env python3
"""
OCR 代理服務器
解決 CORS 跨域問題，同時提供靜態文件服務
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import urllib.error
import json
import os

OCR_API_URL = "http://192.168.0.191:8002"

class CORSProxyHandler(SimpleHTTPRequestHandler):

    def end_headers(self):
        # 添加 CORS 標頭
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        """處理 CORS 預檢請求"""
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        """處理 GET 請求"""
        if self.path.startswith('/api/'):
            self.proxy_request('GET')
        else:
            super().do_GET()

    def do_POST(self):
        """處理 POST 請求"""
        if self.path.startswith('/api/'):
            self.proxy_request('POST')
        else:
            self.send_error(404, "Not Found")

    def proxy_request(self, method):
        """代理請求到 OCR API"""
        # 移除 /api 前綴
        target_path = self.path[4:]  # 去掉 '/api'
        target_url = f"{OCR_API_URL}{target_path}"

        try:
            # 讀取請求內容
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else None

            # 構建代理請求
            req = urllib.request.Request(target_url, data=body, method=method)

            # 複製必要的標頭
            content_type = self.headers.get('Content-Type')
            if content_type:
                req.add_header('Content-Type', content_type)

            # 發送請求
            with urllib.request.urlopen(req, timeout=60) as response:
                response_body = response.read()

                self.send_response(response.status)
                self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
                self.send_header('Content-Length', len(response_body))
                self.end_headers()
                self.wfile.write(response_body)

        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_body = e.read() if e.fp else b'{}'
            self.wfile.write(error_body)

        except urllib.error.URLError as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"無法連接到 OCR API: {str(e)}"}).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def log_message(self, format, *args):
        """自定義日誌格式"""
        print(f"[{self.log_date_time_string()}] {args[0]}")


def run_server(port=8899):
    os.chdir('/home/zhaoi/code/ollama_api')
    server = HTTPServer(('0.0.0.0', port), CORSProxyHandler)
    print(f"🚀 OCR 代理服務器運行中...")
    print(f"📍 本地訪問: http://localhost:{port}/ocr.html")
    print(f"📍 內網訪問: http://192.168.0.74:{port}/ocr.html")
    print(f"🔗 代理 API: {OCR_API_URL}")
    print(f"按 Ctrl+C 停止服務器")
    server.serve_forever()


if __name__ == '__main__':
    run_server()

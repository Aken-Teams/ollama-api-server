import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    proxy: {
      '/api': 'http://localhost:8777',
      '/v1': 'http://localhost:8777',
      '/static': 'http://localhost:8777',
    }
  },
  build: { outDir: 'dist' }
})

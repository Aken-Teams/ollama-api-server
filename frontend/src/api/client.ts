import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

export const apiClient = axios.create({
  baseURL: '/',
  timeout: 60000,
})

apiClient.interceptors.request.use((config) => {
  const apiKey = useAuthStore.getState().apiKey
  if (apiKey) {
    config.headers['Authorization'] = `Bearer ${apiKey}`
  }
  return config
})

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginEndpoint = err.config?.url?.includes('/api/login')
    if (err.response?.status === 401 && !isLoginEndpoint && useAuthStore.getState().isAuthenticated) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default apiClient

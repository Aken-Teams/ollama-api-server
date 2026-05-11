import apiClient from './client'

export interface Stats {
  total_requests?: number
  success_count?: number
  error_count?: number
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  avg_response_time?: number
  active_keys?: number
  model_usage?: Record<string, number>
  daily_requests?: { date: string; count: number }[]
  [key: string]: unknown
}

export interface UsageRecord {
  id?: number
  username?: string
  model?: string
  endpoint?: string
  method?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  status_code?: number
  response_time_ms?: number
  ip_address?: string
  error_message?: string
  request_at?: string
}

export async function fetchStats(): Promise<Stats> {
  const res = await apiClient.get<Stats>('/api/stats')
  return res.data
}

export async function fetchUsage(params?: { limit?: number; offset?: number; username?: string }): Promise<{ total: number; logs: UsageRecord[] }> {
  const res = await apiClient.get<{ total: number; logs: UsageRecord[] }>('/api/usage', { params })
  return { total: res.data.total ?? 0, logs: res.data.logs ?? [] }
}

export async function fetchUsers(): Promise<unknown[]> {
  const res = await apiClient.get<unknown[]>('/api/users')
  return Array.isArray(res.data) ? res.data : []
}

export interface SystemInfo {
  cpu_percent: number
  cpu_count: number
  memory: { total_gb: number; used_gb: number; percent: number }
  disk: { total_gb: number; used_gb: number; percent: number }
  load_avg: number[]
  uptime: string
  gpu_percent: number | null
}

export async function fetchSystemInfo(): Promise<SystemInfo> {
  const res = await apiClient.get<SystemInfo>('/api/system/info')
  return res.data
}

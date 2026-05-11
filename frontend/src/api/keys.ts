import apiClient from './client'

export interface ApiKey {
  id: number
  username: string
  api_key_prefix: string
  description: string
  is_active: boolean
  is_admin: boolean
  request_count: number
  created_at: string
  last_used_at: string | null
  allowed_models: string[] | null
}

export interface CreateKeyRequest {
  username: string
  description: string
  is_admin?: boolean
}

export async function fetchKeys(): Promise<ApiKey[]> {
  const res = await apiClient.get<{ keys: ApiKey[] }>('/api/keys')
  return res.data.keys
}

export async function createKey(data: CreateKeyRequest): Promise<{ api_key: string; key: ApiKey }> {
  const res = await apiClient.post('/api/keys', data)
  return res.data
}

export async function updateKey(id: number, data: Partial<ApiKey>): Promise<ApiKey> {
  const res = await apiClient.put(`/api/keys/${id}`, data)
  return res.data
}

export async function deleteKey(id: number): Promise<void> {
  await apiClient.delete(`/api/keys/${id}`)
}

export async function regenerateKey(id: number): Promise<{ api_key: string }> {
  const res = await apiClient.post(`/api/keys/${id}/regenerate`)
  return res.data
}

export async function updatePermissions(username: string, allowed_models: string[] | null): Promise<void> {
  await apiClient.put(`/api/permissions/${username}`, {
    allowed_models,
    allowed_features: null,
    daily_request_limit: 0,
    daily_token_limit: 0,
  })
}

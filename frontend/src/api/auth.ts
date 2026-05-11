import apiClient from './client'

export interface LoginResponse {
  api_key: string
  user: { username: string; is_admin: boolean }
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/api/login', { username, password })
  return res.data
}

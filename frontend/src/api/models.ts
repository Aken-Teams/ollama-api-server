import apiClient from './client'

export interface Model {
  id: string
  provider?: string
  owned_by?: string
  object?: string
}

export interface ModelsResponse {
  data: Model[]
}

export async function fetchModels(): Promise<Model[]> {
  const res = await apiClient.get<ModelsResponse>('/v1/models')
  return res.data.data
}

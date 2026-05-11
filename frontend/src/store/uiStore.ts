import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  tourActive: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setTourActive: (active: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  tourActive: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTourActive: (active) => set({ tourActive: active }),
}))

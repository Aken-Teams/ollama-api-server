import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  username: string
  is_admin: boolean
}

interface AuthState {
  user: User | null
  apiKey: string | null
  isAuthenticated: boolean
  _hydrated: boolean
  login: (user: User, apiKey: string) => void
  logout: () => void
  setHydrated: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      apiKey: null,
      isAuthenticated: false,
      _hydrated: false,
      login: (user, apiKey) => set({ user, apiKey, isAuthenticated: true }),
      logout: () => set({ user: null, apiKey: null, isAuthenticated: false }),
      setHydrated: () => set({ _hydrated: true }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        apiKey: state.apiKey,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // state is undefined when localStorage has no stored data (fresh context)
        if (state) {
          state.setHydrated()
        } else {
          useAuthStore.getState().setHydrated()
        }
      },
    }
  )
)

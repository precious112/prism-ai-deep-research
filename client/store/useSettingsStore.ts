import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ApiKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  xai?: string;
}

interface SettingsState {
  apiKeys: ApiKeys;
  setApiKey: (provider: keyof ApiKeys, key: string) => void;
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKeys: {},
      setApiKey: (provider, key) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: key },
        })),
      isSettingsOpen: false,
      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
    }),
    {
      name: 'settings-storage',
      partialize: (state) => ({ apiKeys: state.apiKeys }), // Only persist keys
    }
  )
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Chat, Message, ResearchState, ResearchSource } from '../types';

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  messages: Message[];
  selectedModel: string;
  includeIllustrations: boolean;
  
  // Research State
  activeResearch: ResearchState | null;

  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  updateChat: (chatId: string, updates: Partial<Chat>) => void;
  removeChat: (chatId: string) => void;
  setActiveChat: (chatId: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  setSelectedModel: (model: string) => void;
  setIncludeIllustrations: (enabled: boolean) => void;
  
  // Research Actions
  startResearch: (requestId: string) => void;
  updateResearchStatus: (status: ResearchState['status'], message: string) => void;
  setResearchPlan: (toc: string[]) => void;
  setCurrentStep: (index: number) => void;
  addQuery: (query: string) => void;
  addSource: (source: ResearchSource) => void;
  addReportChunk: (chunk: string) => void;
  completeResearch: () => void;
  resetResearch: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      messages: [],
      selectedModel: 'gpt-4o',
      includeIllustrations: true,
      activeResearch: null,

      setChats: (chats) => set({ chats }),
      addChat: (chat) => set((state) => ({ chats: [chat, ...state.chats], activeChatId: chat.id })),
      updateChat: (chatId, updates) => set((state) => ({
        chats: state.chats.map((c) => (c.id === chatId ? { ...c, ...updates } : c))
      })),
      removeChat: (chatId) => set((state) => ({
        chats: state.chats.filter((c) => c.id !== chatId),
        activeChatId: state.activeChatId === chatId ? null : state.activeChatId
      })),
      setActiveChat: (activeChatId) => set({ activeChatId }),
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      setSelectedModel: (model) => set({ selectedModel: model }),
      setIncludeIllustrations: (enabled) => set({ includeIllustrations: enabled }),

      // Research Actions implementation
      startResearch: (requestId) => set({
        activeResearch: {
          isActive: true,
          status: 'thinking',
          message: 'Initializing...',
          plan: [],
          currentStepIndex: -1,
          queries: [],
          sources: [],
          requestId,
          reportContent: ''
        }
      }),

      addReportChunk: (chunk) => set((state) => {
        if (!state.activeResearch) return {};
        return {
          activeResearch: {
            ...state.activeResearch,
            reportContent: (state.activeResearch.reportContent || '') + chunk
          }
        };
      }),

      updateResearchStatus: (status, message) => set((state) => {
        if (!state.activeResearch) return {};
        return {
          activeResearch: {
            ...state.activeResearch,
            status,
            message
          }
        };
      }),

      setResearchPlan: (toc) => set((state) => {
        if (!state.activeResearch) return {};
        return {
          activeResearch: {
            ...state.activeResearch,
            plan: toc.map((title, index) => ({ id: index, title, status: 'pending' })),
            currentStepIndex: 0
          }
        };
      }),

      setCurrentStep: (index) => set((state) => {
        if (!state.activeResearch) return {};
        const newPlan = [...state.activeResearch.plan];
        
        // Mark previous steps as completed
        newPlan.forEach((step, i) => {
          if (i < index) step.status = 'completed';
          if (i === index) step.status = 'in_progress';
        });

        return {
          activeResearch: {
            ...state.activeResearch,
            plan: newPlan,
            currentStepIndex: index
          }
        };
      }),

      addQuery: (query) => set((state) => {
        if (!state.activeResearch) return {};
        // Avoid duplicates if needed, or just append
        if (state.activeResearch.queries.includes(query)) return {};
        return {
          activeResearch: {
            ...state.activeResearch,
            queries: [...state.activeResearch.queries, query]
          }
        };
      }),

      addSource: (source) => set((state) => {
        if (!state.activeResearch) return {};
        // Check for duplicates by URL
        if (state.activeResearch.sources.some(s => s.url === source.url)) return {};
        return {
          activeResearch: {
            ...state.activeResearch,
            sources: [...state.activeResearch.sources, source]
          }
        };
      }),

      completeResearch: () => set((state) => {
        if (!state.activeResearch) return {};
        // Mark all steps complete
        const completedPlan = state.activeResearch.plan.map(s => ({ ...s, status: 'completed' as const }));
        
        // Add the final report as a new message
        const reportMessage: Message = {
            id: Date.now().toString(),
            chatId: state.activeChatId || '',
            role: 'assistant',
            content: state.activeResearch.reportContent || '',
            createdAt: new Date().toISOString()
        };

        return {
          messages: [...state.messages, reportMessage],
          activeResearch: {
            ...state.activeResearch,
            status: 'completed',
            message: 'Research complete',
            plan: completedPlan
          }
        };
      }),
      
      resetResearch: () => set({ activeResearch: null })
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({ selectedModel: state.selectedModel, includeIllustrations: state.includeIllustrations }),
    }
  )
);

import axios from 'axios';
import { Chat, Message } from '../types';
import { useAuthStore } from '../store/useAuthStore';
import { toast } from '../hooks/use-toast';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request Interceptor
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    toast(error.message || "Request failed", "error");
    return Promise.reject(error);
  }
);

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });

  failedQueue = [];
};

// Response Interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (originalRequest.url?.includes('/auth/refresh')) {
        // If the refresh request itself failed, logout and show login modal
        // This means the session is truly dead
        useAuthStore.getState().logout();
        useAuthStore.getState().setAuthModalOpen(true);
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return api(originalRequest);
        }).catch((err) => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await api.post('/auth/refresh');
        const { accessToken } = response.data.data;

        if (accessToken) {
          const user = useAuthStore.getState().user;
          if (user) {
            useAuthStore.getState().login(accessToken, user);
          }
          
          processQueue(null, accessToken);
          
          originalRequest.headers['Authorization'] = 'Bearer ' + accessToken;
          return api(originalRequest);
        }
      } catch (err) {
        processQueue(err, null);
        useAuthStore.getState().logout();
        useAuthStore.getState().setAuthModalOpen(true);
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    // Don't show toast for 401s that are being retried or initial 401 before retry
    if (error.response?.status !== 401) {
        const message = error.response?.data?.message || error.message || "An unexpected error occurred";
        toast(message, "error");
    }
    
    return Promise.reject(error);
  }
);

interface ApiResponse<T> {
  success: boolean;
  data: T;
  pagination?: any;
}

export const chatApi = {
  getChats: async (userId: string) => {
    const response = await api.get<ApiResponse<{ chats: Chat[] }>>(`/users/${userId}/chats`);
    return response.data.data.chats;
  },
  createChat: async (userId: string, title?: string) => {
    const response = await api.post<ApiResponse<{ chat: Chat }>>(`/users/${userId}/chats`, { title });
    return response.data.data.chat;
  },
  getMessages: async (chatId: string) => {
    const response = await api.get<ApiResponse<{ messages: Message[] }>>(`/chats/${chatId}/messages`);
    return response.data.data.messages.reverse();
  },
  sendMessage: async (chatId: string, content: string, model?: string, provider?: string, includeIllustrations: boolean = true, apiKey?: string) => {
    const response = await api.post<ApiResponse<{ message: Message }>>(`/chats/${chatId}/messages`, { content, model, provider, includeIllustrations, apiKey });
    return response.data.data.message;
  },
  updateChat: async (chatId: string, title: string) => {
    const response = await api.put<ApiResponse<Chat>>(`/chats/${chatId}`, { title });
    return response.data.data;
  },
  deleteChat: async (chatId: string) => {
    await api.delete(`/chats/${chatId}`);
  }
};

export default api;

import { useEffect, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { chatApi } from '../lib/api';
import { AgentUpdateMessage } from '../types';
import { toast } from './use-toast';

export const useSocket = () => {
  const { user } = useAuthStore();
  const { 
    startResearch, 
    updateResearchStatus, 
    setResearchPlan, 
    setCurrentStep, 
    addQuery, 
    addSource, 
    addReportChunk,
    completeResearch 
  } = useChatStore();

  const [socketUrl, setSocketUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      setSocketUrl(`${process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080"}/ws?userId=${user.id}`);
    }
  }, [user]);

  const { lastMessage, readyState } = useWebSocket(socketUrl, {
    shouldReconnect: (closeEvent) => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => console.log('WebSocket Connected'),
    onClose: () => console.log('WebSocket Disconnected'),
    onError: (e) => {
      console.error('WebSocket Error', e);
      toast('WebSocket connection error', 'error');
    },
  });

  useEffect(() => {
    if (lastMessage !== null) {
      try {
        const data = JSON.parse(lastMessage.data) as AgentUpdateMessage;
        const payloadData = data.payload.data || {};
        
        // Filter events by active chat to prevent zombie tasks from hijacking the UI
        const activeChatId = useChatStore.getState().activeChatId;
        const eventChatId = payloadData.chatId;

        if (eventChatId && activeChatId && eventChatId !== activeChatId) {
            return;
        }
        
        if (data.type === 'agent_update') {
          const { status, message } = data.payload;
          const { event_type, requestId } = payloadData;

          // Get fresh state directly to avoid dependency loops in useEffect
          const activeResearch = useChatStore.getState().activeResearch;

          // Initialize research state if new request
          if (requestId && (!activeResearch || activeResearch.requestId !== requestId)) {
             // Only start if it's not a completion event
             if (event_type !== 'completed') {
                 startResearch(requestId);
             }
          }

          if (event_type === 'plan_created' && payloadData.toc) {
            setResearchPlan(payloadData.toc);
            updateResearchStatus('planning', 'Plan created');
          } else if (event_type === 'research_started' && typeof payloadData.section_index === 'number') {
            setCurrentStep(payloadData.section_index);
            updateResearchStatus('researching', `Researching: ${payloadData.topic}`);
          } else if (event_type === 'tool_start' && payloadData.query) {
             addQuery(payloadData.query);
          } else if (event_type === 'source_found' && payloadData.url && payloadData.title) {
             addSource({ title: payloadData.title, url: payloadData.url });
          } else if (event_type === 'report_chunk' && payloadData.chunk) {
             addReportChunk(payloadData.chunk);
          } else if (event_type === 'title_generated' && payloadData.title && payloadData.chatId) {
             const title = payloadData.title;
             const chatId = payloadData.chatId;
             const chats = useChatStore.getState().chats;
             const chat = chats.find(c => c.id === chatId);
             if (chat && chat.title === 'New Chat') {
                 chatApi.updateChat(chatId, title).then(() => {
                     useChatStore.getState().updateChat(chatId, { title });
                 }).catch(err => console.error('Failed to update chat title', err));
             }
          } else if (event_type === 'completed') {
             completeResearch();
          } else {
             // Generic status update
             let feStatus: any = 'thinking';
             if (status === 'action') feStatus = 'researching';
             if (status === 'output') feStatus = 'writing';
             
             // Only update if we have a generic message or status change
             updateResearchStatus(feStatus, message);
          }
        } else if (data.type === 'agent_error') {
            const { message } = data.payload;
            toast(message, 'error');
            
            const requestId = payloadData?.requestId;
            if (requestId) {
                 const activeResearch = useChatStore.getState().activeResearch;
                 if (!activeResearch || activeResearch.requestId !== requestId) {
                     startResearch(requestId);
                 }
            }
            
            updateResearchStatus('error', message || 'An error occurred.');
        }
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    }
  }, [lastMessage, startResearch, updateResearchStatus, setResearchPlan, setCurrentStep, addQuery, addSource, addReportChunk, completeResearch]);

  return {
    readyState
  };
};

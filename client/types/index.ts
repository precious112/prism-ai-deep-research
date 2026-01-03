export interface User {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

// Research Types
export interface ResearchStep {
  id: number;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchState {
  isActive: boolean;
  status: 'idle' | 'thinking' | 'planning' | 'researching' | 'writing' | 'completed' | 'error';
  message: string;
  plan: ResearchStep[];
  currentStepIndex: number;
  queries: string[];
  sources: ResearchSource[];
  requestId?: string;
  reportContent?: string;
}

// WebSocket Types
export interface AgentUpdatePayload {
  agent: string;
  status: string; // 'thinking', 'action', 'output'
  message: string;
  data: {
    requestId?: string;
    event_type?: string;
    toc?: string[]; // Table of Contents (Plan)
    section_index?: number;
    topic?: string;
    tool?: string;
    query?: string;
    title?: string;
    url?: string;
    chunk?: string;
    chunk_index?: number;
    // ... any other dynamic fields
    [key: string]: any;
  };
}

export interface AgentUpdateMessage {
  target_user_id: string;
  type: 'agent_update' | 'agent_error';
  payload: AgentUpdatePayload;
}

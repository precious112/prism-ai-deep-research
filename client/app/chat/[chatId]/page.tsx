'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useChatStore } from '@/store/useChatStore';
import { chatApi } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, User as UserIcon, Bot, Loader2, Image as ImageIcon, ImageOff } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';

import { useSocket } from '@/hooks/use-socket';
import { StatusIndicator } from '@/components/chat/status-indicator';
import { ProgressSteps } from '@/components/chat/progress-steps';
import { SearchQueries } from '@/components/chat/search-queries';
import { SourceCarousel } from '@/components/chat/source-carousel';
import { ReportRenderer } from '@/components/chat/report-renderer';
import { useSettingsStore } from '@/store/useSettingsStore';

const AVAILABLE_MODELS = [
  {
    provider: "OpenAI",
    models: [
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "o3-mini", name: "o3-mini" },
    ],
  },
  {
    provider: "Anthropic",
    models: [
      { id: "claude-opus-4-1", name: "Claude Opus 4.1" },
      { id: "claude-opus-4", name: "Claude Opus 4" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "claude-3-7-sonnet-latest", name: "Claude 3.7 Sonnet" },
      { id: "claude-3-5-sonnet-latest", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-latest", name: "Claude 3.5 Haiku" },
    ],
  },
  {
    provider: "Google",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite" },
      { id: "gemini-3-pro", name: "Gemini 3 Pro" },
      { id: "gemini-3-flash", name: "Gemini 3 Flash" },
    ],
  },
  {
    provider: "xAI",
    models: [
      { id: "grok-4", name: "Grok 4" },
      { id: "grok-4.1-fast", name: "Grok 4.1 Fast" },
      { id: "grok-3", name: "Grok 3" },
      { id: "x-ai/grok-3-mini-beta", name: "Grok 3 Mini Beta" },
    ],
  },
];

const getProviderForModel = (modelId: string) => {
  for (const group of AVAILABLE_MODELS) {
    if (group.models.find((m) => m.id === modelId)) {
      return group.provider;
    }
  }
  return 'OpenAI';
};

export default function ChatPage() {
  const params = useParams();
  const chatId = params?.chatId as string;
  
  // Initialize WebSocket
  useSocket();

  const { apiKeys } = useSettingsStore();
  const { messages, setMessages, addMessage, activeResearch, selectedModel, setSelectedModel, includeIllustrations, setIncludeIllustrations } = useChatStore();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    shouldAutoScrollRef.current = isAtBottom;
  };

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
  };

  useEffect(() => {
    if (chatId) {
      chatApi.getMessages(chatId)
        .then(setMessages)
        .catch(err => console.error('Failed to fetch messages', err));
    }
  }, [chatId, setMessages]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (shouldAutoScrollRef.current && scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeResearch]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || sending) return;

    const content = input.trim();
    setInput('');
    setSending(true);

    try {
        shouldAutoScrollRef.current = true;
        // Optimistically add user message
        const tempId = Date.now().toString();
        addMessage({
            id: tempId,
            chatId,
            role: 'user',
            content,
            createdAt: new Date().toISOString()
        });

        const provider = getProviderForModel(selectedModel);
        const apiKey = apiKeys[provider.toLowerCase() as keyof typeof apiKeys];
        const response = await chatApi.sendMessage(chatId, content, selectedModel, provider, includeIllustrations, apiKey);
        // The API returns the saved message.
        // In a real implementation with WebSocket, we might get two messages back: the user's saved message (with real ID) and then the AI response.
        // Since we are using REST for now to send, and we want to see the AI response, we rely on the backend to trigger AI and eventually we'll fetch it or get it via WS.
        // For now, let's just update the ID of the optimistic message if possible, or just leave it.
        // But importantly, we might want to refetch messages or add the response if the backend returned an immediate response (unlikely for long running tasks).
        
    } catch (error) {
        console.error('Failed to send message', error);
    } finally {
        setSending(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
      }
  }

  const isStreaming = !!(activeResearch && activeResearch.isActive && activeResearch.status !== 'completed');

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full p-4" onScroll={handleScroll}>
          <div className="max-w-3xl mx-auto space-y-6 pb-20">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2 md:gap-4",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <Avatar className={cn(
                  "h-8 w-8 shrink-0",
                  msg.role === 'assistant' ? "hidden md:flex" : "flex"
                )}>
                  {msg.role === 'assistant' && (
                    <AvatarImage src="/prism_ai_logo.jpeg" alt="Prism AI Logo" />
                  )}
                  <AvatarFallback className={msg.role === 'assistant' ? "bg-primary text-primary-foreground" : ""}>
                    {msg.role === 'user' ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                    "flex flex-col gap-2 max-w-[95%] md:max-w-[85%]",
                    msg.role === 'user' ? "items-end" : "items-start"
                )}>
                    <div className={cn(
                        "rounded-lg px-4 py-2 text-sm",
                        msg.role === 'user' 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted text-foreground"
                    )}>
                        {msg.role === 'user' ? (
                             <div className="whitespace-pre-wrap">{msg.content}</div>
                        ) : (
                            <ReportRenderer content={msg.content} />
                        )}
                    </div>
                </div>
              </div>
            ))}

            {/* Active Research Progress */}
            {activeResearch && activeResearch.isActive && activeResearch.status !== 'completed' && (
                <div className="flex gap-2 md:gap-4 flex-row animate-in fade-in slide-in-from-bottom-2">
                    <Avatar className="h-8 w-8 shrink-0 hidden md:flex">
                        <AvatarImage src="/prism_ai_logo.jpeg" alt="Prism AI Logo" />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                            <Bot className="h-4 w-4" />
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-2 max-w-[95%] md:max-w-[85%] w-full">
                        <div className="rounded-lg px-4 py-4 text-sm bg-muted/50 text-foreground w-full border border-border/50">
                            <StatusIndicator status={activeResearch.status} message={activeResearch.message} />
                            <SearchQueries queries={activeResearch.queries} />
                            <SourceCarousel sources={activeResearch.sources} />
                            <ProgressSteps steps={activeResearch.plan} isComplete={false} />
                            
                            {activeResearch.reportContent && (
                                <div className="mt-4 pt-4 border-t border-border/50">
                                    <ReportRenderer content={activeResearch.reportContent} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 bg-background border-t">
        <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="relative rounded-xl border bg-background focus-within:ring-1 focus-within:ring-ring p-3 shadow-sm transition-all duration-200">
                <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything..."
                    className="min-h-[60px] w-full resize-none bg-transparent border-0 p-1 placeholder:text-muted-foreground focus-visible:ring-0 shadow-none text-base"
                    rows={1}
                />
                <div className="flex justify-between items-center mt-3 pt-2">
                    <div className="flex items-center gap-2">
                         <Select value={selectedModel} onValueChange={handleModelChange}>
                            <SelectTrigger className="h-8 border-0 shadow-none focus:ring-0 w-auto gap-2 px-2 text-muted-foreground hover:text-foreground bg-transparent hover:bg-muted/50 rounded-md transition-colors">
                                <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                            <SelectContent>
                                {AVAILABLE_MODELS.map((group) => (
                                  <SelectGroup key={group.provider}>
                                    <SelectLabel>{group.provider}</SelectLabel>
                                    {group.models.map((model) => (
                                      <SelectItem key={model.id} value={model.id}>
                                        {model.name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))}
                            </SelectContent>
                         </Select>

                         <Button
                            type="button"
                            size="icon"
                            variant="ghost" 
                            onClick={() => setIncludeIllustrations(!includeIllustrations)}
                            className={cn("h-8 w-8 transition-all duration-200", includeIllustrations ? "text-primary" : "text-muted-foreground")}
                            title={includeIllustrations ? "Illustrations enabled" : "Illustrations disabled"}
                        >
                            {includeIllustrations ? <ImageIcon className="h-4 w-4" /> : <ImageOff className="h-4 w-4" />}
                        </Button>
                    </div>

                    <Button 
                        type="submit" 
                        size="icon" 
                        disabled={!input.trim() || sending || isStreaming}
                        className="h-8 w-8 transition-all duration-200"
                    >
                        {sending || isStreaming ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </form>
        </div>
      </div>
    </div>
  );
}

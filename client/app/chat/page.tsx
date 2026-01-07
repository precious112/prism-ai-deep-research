'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { chatApi } from '@/lib/api';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Bot, Loader2, Image as ImageIcon, ImageOff } from 'lucide-react';
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
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
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
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro" },
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

export default function NewChatPage() {
  const router = useRouter();
  const { user, isAuthenticated, setAuthModalOpen } = useAuthStore();
  const { apiKeys } = useSettingsStore();
  const { addChat, addMessage, selectedModel, setSelectedModel, includeIllustrations, setIncludeIllustrations, startResearch } = useChatStore();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const handleModelChange = (value: string) => {
    setSelectedModel(value);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!input.trim()) return;

    if (!isAuthenticated || !user) {
        setAuthModalOpen(true);
        return;
    }

    if (sending) return;

    const content = input.trim();
    setInput('');
    setSending(true);

    try {
        // 1. Create a new chat
        const newChat = await chatApi.createChat(user.id);
        addChat(newChat);

        // 2. Send the message to the new chat
        const provider = getProviderForModel(selectedModel);
        const apiKey = apiKeys[provider.toLowerCase() as keyof typeof apiKeys];
        const serperApiKey = apiKeys.serper;
        await chatApi.sendMessage(newChat.id, content, selectedModel, provider, includeIllustrations, apiKey, serperApiKey);

        // 3. Start research state immediately so the next page shows loading
        startResearch('pending');

        // 4. Redirect to the new chat page
        router.push(`/chat/${newChat.id}`);
        
    } catch (error) {
        console.error('Failed to create chat or send message', error);
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

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full">
          <div className="flex flex-col items-center justify-center min-h-full p-4">
            <div className="max-w-2xl w-full space-y-8 text-center">
                <div className="space-y-4">
                    <Avatar className="h-20 w-20 mx-auto">
                        <AvatarImage src="/prism_ai_logo.jpeg" alt="Prism AI Logo" />
                        <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                            <Bot className="h-10 w-10" />
                        </AvatarFallback>
                    </Avatar>
                    <h1 className="text-3xl font-bold tracking-tight">How can I help you today?</h1>
                    <p className="text-muted-foreground text-lg">
                        I'm Prism AI, capable of deep web research and complex reasoning.
                    </p>
                </div>
            </div>
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
                    autoFocus
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
                            className={`h-8 w-8 transition-all duration-200 ${includeIllustrations ? "text-primary" : "text-muted-foreground"}`}
                            title={includeIllustrations ? "Illustrations enabled" : "Illustrations disabled"}
                        >
                            {includeIllustrations ? <ImageIcon className="h-4 w-4" /> : <ImageOff className="h-4 w-4" />}
                        </Button>
                    </div>

                    <Button 
                        type="submit" 
                        size="icon" 
                        disabled={!input.trim() || sending}
                        className="h-8 w-8 transition-all duration-200"
                    >
                        {sending ? (
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

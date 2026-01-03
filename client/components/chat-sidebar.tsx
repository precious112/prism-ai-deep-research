'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import api, { chatApi } from '@/lib/api';
import { Chat } from '@/types';
import { Button, buttonVariants } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageSquare, MoreHorizontal, Pencil, Trash, X, Check, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ChatSidebarProps {
  className?: string;
  onSelect?: () => void; // For closing mobile sheet on select
}

export function ChatSidebar({ className, onSelect }: ChatSidebarProps) {
  const router = useRouter();
  const params = useParams();
  const activeChatId = params?.chatId as string;

  const { user, logout } = useAuthStore();
  const { chats, setChats, addChat, updateChat, removeChat } = useChatStore();
  const [loading, setLoading] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    if (user?.id) {
      chatApi.getChats(user.id)
        .then(fetchedChats => {
          setChats(fetchedChats);
        })
        .catch(err => console.error('Failed to fetch chats', err));
    }
  }, [user?.id, setChats]);

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      logout();
      router.push("/login");
    }
  };

  const handleNewChat = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const newChat = await chatApi.createChat(user.id);
      addChat(newChat);
      router.push(`/chat/${newChat.id}`);
      if (onSelect) onSelect();
    } catch (error) {
      console.error('Failed to create chat', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChatSelect = (chatId: string) => {
    router.push(`/chat/${chatId}`);
    if (onSelect) onSelect();
  };

  const handleRenameStart = (chat: Chat, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title || "");
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChatId) return;
    try {
      await chatApi.updateChat(editingChatId, editTitle);
      updateChat(editingChatId, { title: editTitle });
      setEditingChatId(null);
    } catch (err) {
      console.error("Failed to rename chat", err);
    }
  };

  const handleDeleteClick = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteChatId(chatId);
  };

  const confirmDelete = async () => {
    if (!deleteChatId) return;
    try {
      await chatApi.deleteChat(deleteChatId);
      removeChat(deleteChatId);
      if (activeChatId === deleteChatId) {
        router.push('/');
      }
    } catch (err) {
      console.error("Failed to delete chat", err);
    } finally {
      setDeleteChatId(null);
    }
  };

  return (
    <div className={cn("pb-12 h-full border-r bg-background", className)}>
      <div className="space-y-4 py-4 h-full flex flex-col">
        <div className="px-3 py-2">
          <Button onClick={handleNewChat} disabled={loading} className="w-full justify-start gap-2">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-hidden px-3">
          <ScrollArea className="h-full">
            <div className="space-y-1">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "group flex items-center w-full gap-1 rounded-md px-2 py-1 hover:bg-accent/50",
                    activeChatId === chat.id ? "bg-accent" : "transparent"
                  )}
                >
                  {editingChatId === chat.id ? (
                    <form
                      onSubmit={handleRenameSubmit}
                      className="flex-1 flex items-center gap-1"
                    >
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-7 text-sm px-2"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        type="submit"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChatId(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        className="flex-1 justify-start gap-2 font-normal truncate h-auto p-0 hover:bg-transparent min-w-0"
                        onClick={() => handleChatSelect(chat.id)}
                      >
                        <MessageSquare className="h-4 w-4 flex-shrink-0" />
                        <span className="text-left flex-1 min-w-0">
                          {(chat.title || "Untitled Chat").length > 17 
                            ? (chat.title || "Untitled Chat").substring(0, 17) + "..." 
                            : (chat.title || "Untitled Chat")}
                        </span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-accent text-foreground focus:outline-none focus:ring-2 focus:ring-ring z-10">
                            <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => handleRenameStart(chat, e)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => handleDeleteClick(chat.id, e)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              ))}
              {chats.length === 0 && (
                <div className="text-sm text-muted-foreground p-2 text-center">
                  No chats yet.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        
        {user && (
          <div className="px-3 pt-2 border-t">
            <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate">{user.firstName || user.email || 'User'}</span>
                <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="shrink-0 text-muted-foreground hover:text-destructive h-8 w-8">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!deleteChatId} onOpenChange={(open) => !open && setDeleteChatId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteChatId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

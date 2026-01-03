'use client';

import { useState } from 'react';
import { ChatSidebar } from '@/components/chat-sidebar';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <>
      {/* 
        Main layout container. 
        Height is calculated to fill the screen minus the global navbar height (4rem/64px).
      */}
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-background">
        
        {/* Mobile Header */}
        <div className="md:hidden h-16 border-b bg-background flex items-center px-4 shrink-0">
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="-ml-2">
                        <Menu className="h-6 w-6" />
                        <span className="sr-only">Toggle Sidebar</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-72">
                    <SheetTitle className="sr-only">Chat Navigation</SheetTitle>
                    <ChatSidebar onSelect={() => setIsSidebarOpen(false)} />
                </SheetContent>
            </Sheet>
            <div className="ml-4 font-semibold">Prism AI</div>
        </div>

        {/* Workspace Area (Sidebar + Chat) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop Sidebar */}
          <aside className="hidden md:flex w-64 flex-col border-r bg-background">
            <ChatSidebar className="h-full w-full" />
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 h-full w-full relative">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

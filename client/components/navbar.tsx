"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import { useRouter, usePathname } from "next/navigation";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "./settings-dialog";
import { Settings } from "lucide-react";

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout } = useAuthStore();
  const setSettingsOpen = useSettingsStore((state) => state.setSettingsOpen);

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

  const isChatPage = pathname?.startsWith('/chat');

  return (
    <nav className={cn(
      "border-b bg-background sticky top-0 z-40 w-full",
      isChatPage && "hidden md:block"
    )}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2">
                <Image 
                  src="/prism_ai_logo.jpeg" 
                  alt="Prism AI Logo" 
                  width={32} 
                  height={32} 
                  className="rounded-full object-cover"
                />
                <span className="text-xl font-bold text-primary">Prism AI</span>
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <div className="hidden md:flex items-center space-x-4">
                  {(user?.firstName || user?.email) && (
                    <span className="text-sm text-muted-foreground">
                      Hello, {user?.firstName || user?.email}
                    </span>
                  )}
                  <Link href="/chat">
                    <Button variant="ghost">Chat</Button>
                  </Link>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
                  <Settings className="h-5 w-5" />
                </Button>
                <Button onClick={handleLogout} variant="destructive" size="sm">
                  Logout
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
                  <Settings className="h-5 w-5" />
                </Button>
                <Link href="/login">
                  <Button variant="ghost">Login</Button>
                </Link>
                <Link href="/register">
                  <Button>Register</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <SettingsDialog />
    </nav>
  );
}

"use client";

import { useSettingsStore } from "@/store/useSettingsStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SettingsDialog() {
  const { isSettingsOpen, setSettingsOpen, apiKeys, setApiKey } = useSettingsStore();

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>API Settings</DialogTitle>
          <DialogDescription>
            Enter your API keys to use different LLM providers. These are stored locally on your device.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="openai" className="text-right text-sm font-medium">
              OpenAI
            </label>
            <Input
              id="openai"
              type="password"
              placeholder="sk-..."
              value={apiKeys.openai || ""}
              onChange={(e) => setApiKey("openai", e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="anthropic" className="text-right text-sm font-medium">
              Anthropic
            </label>
            <Input
              id="anthropic"
              type="password"
              placeholder="sk-ant-..."
              value={apiKeys.anthropic || ""}
              onChange={(e) => setApiKey("anthropic", e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="google" className="text-right text-sm font-medium">
              Google
            </label>
            <Input
              id="google"
              type="password"
              placeholder="AIza..."
              value={apiKeys.google || ""}
              onChange={(e) => setApiKey("google", e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="xai" className="text-right text-sm font-medium">
              xAI
            </label>
            <Input
              id="xai"
              type="password"
              placeholder="xai-..."
              value={apiKeys.xai || ""}
              onChange={(e) => setApiKey("xai", e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

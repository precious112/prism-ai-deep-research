"use client";

import React from 'react';
import { Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMobile } from '@/hooks/use-mobile';

interface CodeExecutorProps {
  code: string;
}

export function CodeExecutor({ code }: CodeExecutorProps) {
  const isMobile = useMobile();

  if (isMobile) {
    return null;
  }

  // The agent generates a complete HTML document.
  // We assume 'code' is the full HTML string starting with <!DOCTYPE html>.
  
  return (
    <Dialog>
      <div className="relative group w-full my-6">
        <div className="w-full h-[500px] border rounded-lg overflow-hidden bg-background shadow-sm">
          <iframe
            srcDoc={code}
            className="w-full h-full"
            sandbox="allow-scripts" // Allow JS execution
            title="Visualization Preview"
            style={{ border: 'none' }}
          />
        </div>
        
        <DialogTrigger asChild>
          <Button 
            variant="outline" 
            size="icon" 
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background"
            aria-label="Maximize Visualization"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="max-w-[90vw] h-[90vh] p-0 border-none bg-transparent shadow-none">
        {/* Hidden title for accessibility requirements of Radix Dialog */}
        <DialogTitle className="sr-only">Visualization</DialogTitle>
        <DialogDescription className="sr-only">Interactive visualization full screen view</DialogDescription>
        
        <div className="w-full h-full bg-background rounded-lg overflow-hidden relative">
             <iframe
                srcDoc={code}
                className="w-full h-full"
                sandbox="allow-scripts"
                title="Visualization Fullscreen"
                style={{ border: 'none' }}
              />
        </div>
      </DialogContent>
    </Dialog>
  );
}

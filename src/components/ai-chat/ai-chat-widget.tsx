"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AiChatContent } from "@/components/ai-chat/ai-chat-content";
import type { ChatMessage } from "@/lib/ai/client";

export function AiChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasNewResponse, setHasNewResponse] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Ephemeral: fresh conversation on every navigation
  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, [pathname]);

  // Clear notification dot when panel opens
  useEffect(() => {
    if (open) setHasNewResponse(false);
  }, [open]);

  function handleClose() {
    abortRef.current?.abort();
    setOpen(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      {/* Floating launcher button */}
      <DialogPrimitive.Trigger asChild>
        <button
          aria-label="Open AI assistant"
          className="group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full
            animate-ai-shimmer bg-gradient-to-br from-[hsl(var(--ai-accent))] via-[hsl(var(--ai-accent-2))] to-[hsl(var(--ai-accent))]
            text-white shadow-lg shadow-[hsl(var(--ai-accent)/0.35)] dark:shadow-[hsl(var(--ai-accent)/0.5)]
            transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-[hsl(var(--ai-accent)/0.45)]
            active:scale-95"
        >
          {/* Ambient pulse ring */}
          <span className="absolute inset-0 animate-ping rounded-full bg-[hsl(var(--ai-accent))] opacity-20" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-[hsl(var(--ai-accent))] via-[hsl(var(--ai-accent-2))] to-[hsl(var(--ai-accent))]" />
          <Sparkles className="relative z-10 h-5 w-5 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />

          {/* Notification dot */}
          {hasNewResponse && (
            <span className="absolute -right-0.5 -top-0.5 z-20 flex h-4 w-4 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
          )}
        </button>
      </DialogPrimitive.Trigger>

      {/* Panel — forceMount so AnimatePresence can drive exit animations */}
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop: subtle dim on mobile, near-transparent on desktop */}
              <DialogPrimitive.Overlay asChild>
                <motion.div
                  key="ai-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-50 bg-black/60 sm:bg-black/10"
                  onClick={handleClose}
                />
              </DialogPrimitive.Overlay>

              {/* Glass card */}
              <DialogPrimitive.Content asChild onEscapeKeyDown={handleClose}>
                <motion.div
                  key="ai-panel"
                  style={{ transformOrigin: "bottom right" }}
                  initial={{ opacity: 0, scale: 0.92, y: 24 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: 24 }}
                  transition={{ type: "spring", damping: 22, stiffness: 300 }}
                  className={[
                    // Mobile: full screen
                    "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background",
                    // Desktop: floating glass card anchored bottom-right above the FAB
                    "sm:inset-auto sm:bottom-24 sm:right-6",
                    "sm:h-[640px] sm:max-h-[80vh] sm:w-[400px]",
                    "sm:rounded-3xl sm:border sm:border-border/60",
                    "sm:bg-card/80 sm:backdrop-blur-2xl",
                    "sm:shadow-2xl sm:shadow-[hsl(var(--ai-accent)/0.15)] dark:sm:shadow-[hsl(var(--ai-accent)/0.25)]",
                  ].join(" ")}
                  aria-modal="true"
                  role="dialog"
                  aria-label="AI Assistant"
                >
                  {/* Screen-reader title — satisfies Radix Dialog contract */}
                  <DialogPrimitive.Title className="sr-only">
                    Virtual HR Assistant
                  </DialogPrimitive.Title>

                  {/* Signature red gradient bar at top */}
                  <div className="h-[3px] w-full flex-shrink-0 animate-ai-shimmer bg-gradient-to-r from-[hsl(var(--ai-accent))] via-[hsl(var(--ai-accent-2))] to-[hsl(var(--ai-accent))]" />

                  {/* Header */}
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-border/50 bg-card/50 px-5 py-4 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                      {/* Brand icon tile */}
                      <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--ai-accent))] to-[hsl(var(--ai-accent-2))] shadow-md shadow-[hsl(var(--ai-accent)/0.35)]">
                        <Sparkles className="h-4 w-4 text-white" />
                        <span className="absolute inset-0 rounded-2xl bg-white/10" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-tight tracking-tight text-foreground">
                          Virtual HR Assistant
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Ask about this page
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleClose}
                      aria-label="Close Virtual HR Assistant"
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground
                        transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <AiChatContent
                    messages={messages}
                    setMessages={setMessages}
                    abortRef={abortRef}
                    onAssistantResponse={() => {
                      if (!open) setHasNewResponse(true);
                    }}
                  />
                </motion.div>
              </DialogPrimitive.Content>
            </>
          )}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

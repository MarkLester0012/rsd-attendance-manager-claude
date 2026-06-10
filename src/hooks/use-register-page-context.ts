"use client";

import { useEffect } from "react";
import { useAiChatContextStore } from "@/stores/ai-chat-context-store";

// Lets a page "publish" a snapshot of its on-screen data so the AI chat
// widget (mounted at the layout level) can answer questions about it.
// Owns the full lifecycle: registers on mount/update, clears on unmount —
// so navigating away never leaves stale context for the next page to inherit.
export function useRegisterPageContext(
  pageTitle: string,
  data: Record<string, unknown>
) {
  const setContext = useAiChatContextStore((s) => s.setContext);
  const clearContext = useAiChatContextStore((s) => s.clearContext);

  // Stringify so an inline object literal at the call site doesn't thrash
  // the effect every render — only actual content changes re-register.
  const serialized = JSON.stringify(data);

  useEffect(() => {
    setContext({ pageTitle, data: JSON.parse(serialized) });
    return () => clearContext();
  }, [pageTitle, serialized, setContext, clearContext]);
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Send, User, Loader2, Sparkles, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAiChatContextStore } from "@/stores/ai-chat-context-store";
import type { ChatMessage } from "@/lib/ai/client";

// Context-aware suggestion chips
const PAGE_SUGGESTIONS: Record<string, string[]> = {
  Dashboard: ["Summarize my activity", "Summarize the most recent announcement"],
  "My Leaves": ["How many VL days do I have left?", "Show my recent leaves"],
  Calendar: ["What leaves do I have this month?", "Any holidays coming up?"],
  Attendance: ["Who's not in office today?", "Are all my team members present?"],
  Reports: ["Give me a summary of this data", "What stands out here?"],
  "Transportation Allowance": ["Summarize this pay period", "Who's missing a snapshot?"],
  "Time Logger": ["What did I do this week?", "What projects am I spending the most time on?"],
};

const DEFAULT_SUGGESTIONS = [
  "What can you help me with?",
  "How does the leave system work?",
];

interface AiChatContentProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  abortRef: React.MutableRefObject<AbortController | null>;
  onAssistantResponse?: () => void;
}

export function AiChatContent({
  messages,
  setMessages,
  abortRef,
  onAssistantResponse,
}: AiChatContentProps) {
  const context = useAiChatContextStore((s) => s.context);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom only when already near the bottom (don't fight user scrolling up)
  useEffect(() => {
    const el = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (!el) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  // On (re)mount — e.g. reopening the panel — jump straight to the latest
  // message instead of the fresh viewport's default scrollTop=0.
  useLayoutEffect(() => {
    if (messages.length === 0) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Abort stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [abortRef]);

  async function sendMessage(text?: string) {
    const messageText = (text ?? input).trim();
    if (!messageText || sending) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: messageText },
    ];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);

    // Create a fresh AbortController for this request
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageTitle: context?.pageTitle,
          contextData: context?.data,
          messages: nextMessages,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        let errorMsg = `Server error (${res.status})`;
        try {
          const errData = await res.json();
          if (errData.error) errorMsg = errData.error;
        } catch {
          // Ignore json parse error
        }
        throw new Error(errorMsg);
      }

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      onAssistantResponse?.();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        appendToLastAssistant(acc);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        // Intentional abort — remove the empty assistant placeholder
        setMessages((prev) => prev.filter((_, i) => {
          if (i === prev.length - 1 && prev[i].role === "assistant" && prev[i].content === "") return false;
          return true;
        }));
        return;
      }
      const errMsg = e instanceof Error ? e.message : "Something went wrong";
      appendToLastAssistant(`Oops! I couldn't get an answer. (${errMsg})`);
    } finally {
      setSending(false);
    }
  }

  function appendToLastAssistant(content: string) {
    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { role: "assistant", content };
      return copy;
    });
  }

  const suggestions = context?.pageTitle
    ? (PAGE_SUGGESTIONS[context.pageTitle] ?? DEFAULT_SUGGESTIONS)
    : DEFAULT_SUGGESTIONS;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea ref={scrollAreaRef} className="flex-1 px-4 py-4">
        {messages.length === 0 ? (
          /* Empty state — anti-slop hero + suggestion chips */
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-6 text-center">
            {/* Glowing brand tile */}
            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-[hsl(var(--ai-accent)/0.25)] blur-xl" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[hsl(var(--ai-accent))] to-[hsl(var(--ai-accent-2))] shadow-lg shadow-[hsl(var(--ai-accent)/0.4)]">
                <Sparkles className="h-9 w-9 text-white" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {context ? `Ask about ${context.pageTitle}` : "How can I help?"}
              </h3>
              <p className="max-w-[240px] text-xs leading-relaxed text-muted-foreground">
                {context
                  ? "I can analyze the data currently on this page for you."
                  : "Navigate to a page like My Leaves or Calendar to get started."}
              </p>
            </div>

            {/* Suggestion chips */}
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3.5 py-1.5
                    text-xs text-muted-foreground backdrop-blur-sm transition-all duration-200
                    hover:border-[hsl(var(--ai-accent)/0.5)] hover:bg-[hsl(var(--ai-accent)/0.06)]
                    hover:text-foreground hover:shadow-sm active:scale-95"
                >
                  <Zap className="h-3 w-3 text-[hsl(var(--ai-accent))]" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 pb-4">
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", damping: 22, stiffness: 300, delay: 0.03 }}
                  className={cn(
                    "flex w-full gap-2.5",
                    m.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm",
                      m.role === "user"
                        ? "bg-gradient-to-br from-[hsl(var(--ai-accent))] to-[hsl(var(--ai-accent-2))] text-white"
                        : "border border-border/60 bg-card text-[hsl(var(--ai-accent))]"
                    )}
                  >
                    {m.role === "user" ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                  </div>

                  {/* Bubble */}
                  <div
                    className={cn(
                      "relative max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                      m.role === "user"
                        ? "rounded-tr-sm bg-gradient-to-br from-[hsl(var(--ai-accent))] to-[hsl(var(--ai-accent-2))] text-white"
                        : "rounded-tl-sm border border-border/50 bg-card/80 text-foreground backdrop-blur-sm"
                    )}
                  >
                    {m.content ? (
                      m.role === "assistant" ? (
                        /* Render markdown for assistant messages */
                        <div className="prose prose-sm max-w-none break-words leading-relaxed
                          dark:prose-invert
                          prose-p:my-1 prose-p:leading-relaxed
                          prose-ul:my-1 prose-ul:pl-4
                          prose-ol:my-1 prose-ol:pl-4
                          prose-li:my-0.5
                          prose-strong:font-semibold prose-strong:text-foreground
                          prose-code:rounded prose-code:bg-muted/60 prose-code:px-1 prose-code:py-0.5 prose-code:text-xs
                          prose-pre:rounded-xl prose-pre:bg-muted/60 prose-pre:text-xs">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="break-words leading-relaxed">{m.content}</p>
                      )
                    ) : m.role === "assistant" && sending ? (
                      /* Branded typing indicator */
                      <div className="flex h-5 items-center gap-1.5 px-1">
                        <span className="ai-dot-1 h-1.5 w-1.5 rounded-full bg-[hsl(var(--ai-accent))]" />
                        <span className="ai-dot-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--ai-accent))]" />
                        <span className="ai-dot-3 h-1.5 w-1.5 rounded-full bg-[hsl(var(--ai-accent))]" />
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
        <div ref={bottomRef} className="h-1" />
      </ScrollArea>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-border/50 bg-card/50 p-4 backdrop-blur-sm">
        <div
          className={cn(
            "relative flex items-end gap-2 rounded-2xl border bg-background/80 p-1.5 shadow-sm transition-all duration-200",
            sending
              ? "border-border/40"
              : "border-border/60 focus-within:border-[hsl(var(--ai-accent)/0.5)] focus-within:shadow-[0_0_0_3px_hsl(var(--ai-accent)/0.08)]"
          )}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={context ? "Ask a question…" : "Navigate to a page first"}
            className="max-h-32 min-h-[44px] resize-none border-0 bg-transparent px-2 py-2.5 text-sm shadow-none focus-visible:ring-0"
            rows={1}
            disabled={sending}
          />
          <Button
            size="icon"
            className={cn(
              "mb-1 mr-0.5 h-8 w-8 shrink-0 rounded-xl transition-all duration-200",
              input.trim() && !sending
                ? "bg-gradient-to-br from-[hsl(var(--ai-accent))] to-[hsl(var(--ai-accent-2))] text-white shadow-md shadow-[hsl(var(--ai-accent)/0.35)] hover:shadow-lg hover:shadow-[hsl(var(--ai-accent)/0.45)] hover:scale-105 active:scale-95"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 translate-x-px" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
          AI can make mistakes. Verify important info.
        </p>
      </div>
    </div>
  );
}

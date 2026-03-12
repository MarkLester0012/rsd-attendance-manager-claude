"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ChevronUp, Send, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getInitials, cn } from "@/lib/utils";
import type { User } from "@/lib/types";

interface SuggestionsContentProps {
  currentUser: User;
  initialSuggestions: any[];
}

export function SuggestionsContent({
  currentUser,
  initialSuggestions,
}: SuggestionsContentProps) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [content, setContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!content.trim()) {
      toast.error("Please write something");
      return;
    }
    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("suggestions")
        .insert({
          user_id: currentUser.id,
          content: content.trim(),
          is_anonymous: isAnonymous,
        })
        .select("*, user:users(id, name)")
        .single();

      if (error) throw error;

      setSuggestions((prev) => [
        { ...data, upvote_count: 0, has_upvoted: false },
        ...prev,
      ]);
      setContent("");
      toast.success("Suggestion posted!");
    } catch {
      toast.error("Failed to post suggestion");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpvote(suggestionId: string) {
    const idx = suggestions.findIndex((s: any) => s.id === suggestionId);
    if (idx === -1) return;

    const s = suggestions[idx];
    const wasUpvoted = s.has_upvoted;

    // Optimistic update
    setSuggestions((prev) =>
      prev.map((item: any) =>
        item.id === suggestionId
          ? {
              ...item,
              has_upvoted: !wasUpvoted,
              upvote_count: wasUpvoted
                ? item.upvote_count - 1
                : item.upvote_count + 1,
            }
          : item
      )
    );

    const supabase = createClient();
    try {
      if (wasUpvoted) {
        const { error } = await supabase
          .from("suggestion_upvotes")
          .delete()
          .eq("suggestion_id", suggestionId)
          .eq("user_id", currentUser.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suggestion_upvotes").insert({
          suggestion_id: suggestionId,
          user_id: currentUser.id,
        });
        if (error) throw error;
      }
    } catch {
      // Revert on error
      setSuggestions((prev) =>
        prev.map((item: any) =>
          item.id === suggestionId
            ? {
                ...item,
                has_upvoted: wasUpvoted,
                upvote_count: wasUpvoted
                  ? item.upvote_count + 1
                  : item.upvote_count - 1,
              }
            : item
        )
      );
      toast.error("Failed to update vote");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Submit form */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Textarea
            placeholder="Share your suggestion or idea..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch checked={isAnonymous} onCheckedChange={setIsAnonymous} />
              <Label className="text-sm text-muted-foreground">
                Post Anonymously
              </Label>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !content.trim()}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Post
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Suggestions list */}
      <div className="space-y-3">
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No suggestions yet. Be the first to share!
          </p>
        ) : (
          suggestions.map((s: any) => {
            const isAuthor = s.user_id === currentUser.id;
            return (
              <Card key={s.id} className="transition-all hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    {/* Upvote */}
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn(
                          "h-8 w-8 rounded-full",
                          s.has_upvoted &&
                            "text-blue-500 bg-blue-500/10 hover:bg-blue-500/20"
                        )}
                        onClick={() => handleUpvote(s.id)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          s.has_upvoted
                            ? "text-blue-500"
                            : "text-muted-foreground"
                        )}
                      >
                        {s.upvote_count}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        {s.is_anonymous ? (
                          <>
                            <span className="text-lg">🕵️</span>
                            <span className="text-sm font-medium text-muted-foreground">
                              Anonymous
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary dark:bg-gradient-to-br dark:from-blue-500 dark:to-indigo-600 text-[9px] font-bold text-white">
                              {getInitials(s.user?.name || "?")}
                            </div>
                            <span className="text-sm font-medium">
                              {s.user?.name || "Unknown"}
                            </span>
                          </>
                        )}
                        {isAuthor && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5"
                          >
                            YOU
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground/50 ml-auto">
                          {format(new Date(s.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/90">{s.content}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

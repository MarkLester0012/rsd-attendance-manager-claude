"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ThumbsUp,
  ThumbsDown,
  Send,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowUpDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getInitials, cn } from "@/lib/utils";
import type {
  User,
  Suggestion,
  SuggestionComment,
  VoteType,
} from "@/lib/types";

type SortOption = "top" | "newest" | "oldest";

interface SuggestionsContentProps {
  currentUser: User;
  initialSuggestions: Suggestion[];
}

function timeAgo(iso: string) {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export function SuggestionsContent({
  currentUser,
  initialSuggestions,
}: SuggestionsContentProps) {
  const [suggestions, setSuggestions] =
    useState<Suggestion[]>(initialSuggestions);
  const [content, setContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sort, setSort] = useState<SortOption>("top");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Suggestion | null>(null);

  const sorted = useMemo(() => {
    const arr = [...suggestions];
    if (sort === "top") {
      arr.sort((a, b) => {
        const sa = (a.like_count ?? 0) - (a.dislike_count ?? 0);
        const sb = (b.like_count ?? 0) - (b.dislike_count ?? 0);
        if (sb !== sa) return sb - sa;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    } else if (sort === "newest") {
      arr.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } else {
      arr.sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    return arr;
  }, [suggestions, sort]);

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
        {
          ...(data as Suggestion),
          like_count: 0,
          dislike_count: 0,
          user_vote: null,
          comment_count: 0,
          comments: [],
        },
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

  async function handleVoteSuggestion(
    suggestionId: string,
    nextVote: VoteType
  ) {
    const prev = suggestions;
    const target = prev.find((s) => s.id === suggestionId);
    if (!target) return;

    const current = target.user_vote ?? null;
    // Toggle off if same vote, switch otherwise
    const resolved: VoteType | null = current === nextVote ? null : nextVote;

    setSuggestions((list) =>
      list.map((s) => {
        if (s.id !== suggestionId) return s;
        const likeDelta =
          (resolved === "like" ? 1 : 0) - (current === "like" ? 1 : 0);
        const dislikeDelta =
          (resolved === "dislike" ? 1 : 0) - (current === "dislike" ? 1 : 0);
        return {
          ...s,
          user_vote: resolved,
          like_count: (s.like_count ?? 0) + likeDelta,
          dislike_count: (s.dislike_count ?? 0) + dislikeDelta,
        };
      })
    );

    const supabase = createClient();
    try {
      if (resolved === null) {
        const { error } = await supabase
          .from("suggestion_upvotes")
          .delete()
          .eq("suggestion_id", suggestionId)
          .eq("user_id", currentUser.id);
        if (error) throw error;
      } else if (current === null) {
        const { error } = await supabase.from("suggestion_upvotes").insert({
          suggestion_id: suggestionId,
          user_id: currentUser.id,
          vote_type: resolved,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("suggestion_upvotes")
          .update({ vote_type: resolved })
          .eq("suggestion_id", suggestionId)
          .eq("user_id", currentUser.id);
        if (error) throw error;
      }
    } catch {
      setSuggestions(prev);
      toast.error("Failed to update vote");
    }
  }

  async function handleVoteComment(
    suggestionId: string,
    commentId: string,
    nextVote: VoteType
  ) {
    const prev = suggestions;
    let currentVote: VoteType | null = null;

    setSuggestions((list) =>
      list.map((s) => {
        if (s.id !== suggestionId) return s;
        return {
          ...s,
          comments: mapCommentsRecursive(s.comments ?? [], (c) => {
            if (c.id !== commentId) return c;
            currentVote = c.user_vote ?? null;
            const resolved: VoteType | null =
              currentVote === nextVote ? null : nextVote;
            const likeDelta =
              (resolved === "like" ? 1 : 0) -
              (currentVote === "like" ? 1 : 0);
            const dislikeDelta =
              (resolved === "dislike" ? 1 : 0) -
              (currentVote === "dislike" ? 1 : 0);
            return {
              ...c,
              user_vote: resolved,
              like_count: (c.like_count ?? 0) + likeDelta,
              dislike_count: (c.dislike_count ?? 0) + dislikeDelta,
            };
          }),
        };
      })
    );

    const resolved: VoteType | null =
      currentVote === nextVote ? null : nextVote;

    const supabase = createClient();
    try {
      if (resolved === null) {
        const { error } = await supabase
          .from("suggestion_comment_votes")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", currentUser.id);
        if (error) throw error;
      } else if (currentVote === null) {
        const { error } = await supabase
          .from("suggestion_comment_votes")
          .insert({
            comment_id: commentId,
            user_id: currentUser.id,
            vote_type: resolved,
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("suggestion_comment_votes")
          .update({ vote_type: resolved })
          .eq("comment_id", commentId)
          .eq("user_id", currentUser.id);
        if (error) throw error;
      }
    } catch {
      setSuggestions(prev);
      toast.error("Failed to update vote");
    }
  }

  async function handleAddComment(
    suggestionId: string,
    text: string,
    parentId: string | null
  ) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("suggestion_comments")
      .insert({
        suggestion_id: suggestionId,
        parent_id: parentId,
        user_id: currentUser.id,
        content: trimmed,
      })
      .select("*, user:users(id, name)")
      .single();

    if (error) {
      toast.error("Failed to post comment");
      return;
    }

    const newComment: SuggestionComment = {
      ...(data as SuggestionComment),
      like_count: 0,
      dislike_count: 0,
      user_vote: null,
      replies: [],
    };

    setSuggestions((list) =>
      list.map((s) => {
        if (s.id !== suggestionId) return s;
        let next: SuggestionComment[];
        if (parentId === null) {
          next = [...(s.comments ?? []), newComment];
        } else {
          next = mapCommentsRecursive(s.comments ?? [], (c) => {
            if (c.id !== parentId) return c;
            return { ...c, replies: [...(c.replies ?? []), newComment] };
          });
        }
        return {
          ...s,
          comments: next,
          comment_count: (s.comment_count ?? 0) + 1,
        };
      })
    );
  }

  async function handleEditComment(
    suggestionId: string,
    commentId: string,
    text: string
  ) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("suggestion_comments")
      .update({ content: trimmed, is_edited: true })
      .eq("id", commentId);

    if (error) {
      toast.error("Failed to edit comment");
      return;
    }

    setSuggestions((list) =>
      list.map((s) => {
        if (s.id !== suggestionId) return s;
        return {
          ...s,
          comments: mapCommentsRecursive(s.comments ?? [], (c) =>
            c.id === commentId ? { ...c, content: trimmed, is_edited: true } : c
          ),
        };
      })
    );
    toast.success("Comment updated");
  }

  async function handleDeleteComment(
    suggestionId: string,
    commentId: string
  ) {
    const supabase = createClient();
    const { error } = await supabase
      .from("suggestion_comments")
      .delete()
      .eq("id", commentId);

    if (error) {
      toast.error("Failed to delete comment");
      return;
    }

    setSuggestions((list) =>
      list.map((s) => {
        if (s.id !== suggestionId) return s;
        const removed = countCommentAndDescendants(s.comments ?? [], commentId);
        return {
          ...s,
          comments: removeCommentRecursive(s.comments ?? [], commentId),
          comment_count: Math.max(0, (s.comment_count ?? 0) - removed),
        };
      })
    );
    toast.success("Comment deleted");
  }

  async function handleEditSuggestion() {
    if (!editingId) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      toast.error("Please write something");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("suggestions")
      .update({ content: trimmed, is_edited: true })
      .eq("id", editingId);

    if (error) {
      toast.error("Failed to edit suggestion");
      return;
    }

    setSuggestions((list) =>
      list.map((s) =>
        s.id === editingId ? { ...s, content: trimmed, is_edited: true } : s
      )
    );
    setEditingId(null);
    setEditContent("");
    toast.success("Suggestion updated");
  }

  async function handleDeleteSuggestion() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const supabase = createClient();
    const { error } = await supabase.from("suggestions").delete().eq("id", id);

    if (error) {
      toast.error("Failed to delete suggestion");
      return;
    }
    setSuggestions((list) => list.filter((s) => s.id !== id));
    setDeleteTarget(null);
    toast.success("Suggestion deleted");
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

      {/* Sort bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">Top voted</SelectItem>
              <SelectItem value="newest">Most recent</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Suggestions list */}
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No suggestions yet. Be the first to share!
          </p>
        ) : (
          sorted.map((s) => (
            <SuggestionItem
              key={s.id}
              suggestion={s}
              currentUser={currentUser}
              onVote={(v) => handleVoteSuggestion(s.id, v)}
              onAddComment={(text, parentId) =>
                handleAddComment(s.id, text, parentId)
              }
              onVoteComment={(commentId, v) =>
                handleVoteComment(s.id, commentId, v)
              }
              onEditComment={(commentId, text) =>
                handleEditComment(s.id, commentId, text)
              }
              onDeleteComment={(commentId) =>
                handleDeleteComment(s.id, commentId)
              }
              onEdit={() => {
                setEditingId(s.id);
                setEditContent(s.content);
              }}
              onDelete={() => setDeleteTarget(s)}
            />
          ))
        )}
      </div>

      {/* Edit suggestion dialog */}
      <Dialog
        open={editingId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEditingId(null);
            setEditContent("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit suggestion</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setEditContent("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEditSuggestion}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete suggestion?</DialogTitle>
            <DialogDescription>
              This will permanently remove the suggestion and all its comments.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSuggestion}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// SuggestionItem
// ============================================================

interface SuggestionItemProps {
  suggestion: Suggestion;
  currentUser: User;
  onVote: (vote: VoteType) => void;
  onAddComment: (text: string, parentId: string | null) => void;
  onVoteComment: (commentId: string, vote: VoteType) => void;
  onEditComment: (commentId: string, text: string) => void;
  onDeleteComment: (commentId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SuggestionItem({
  suggestion: s,
  currentUser,
  onVote,
  onAddComment,
  onVoteComment,
  onEditComment,
  onDeleteComment,
  onEdit,
  onDelete,
}: SuggestionItemProps) {
  const isAuthor = s.user_id === currentUser.id;
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);

  async function submitComment() {
    if (!commentText.trim()) return;
    setPosting(true);
    try {
      await onAddComment(commentText, null);
      setCommentText("");
      setShowComments(true);
    } finally {
      setPosting(false);
    }
  }

  const totalComments = s.comment_count ?? 0;

  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
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
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary dark:bg-gradient-to-br dark:from-blue-500 dark:to-indigo-600 text-[10px] font-bold text-white">
                {getInitials(s.user?.name || "?")}
              </div>
              <span className="text-sm font-medium">
                {s.user?.name || "Unknown"}
              </span>
            </>
          )}
          {isAuthor && (
            <Badge variant="secondary" className="text-[9px] px-1.5">
              YOU
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground/60 ml-auto">
            {timeAgo(s.created_at)}
            {s.is_edited && " · edited"}
          </span>
          {isAuthor && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 -mr-1"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Content */}
        <p className="text-sm text-foreground/90 whitespace-pre-wrap">
          {s.content}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1 border-t">
          <VoteButton
            type="like"
            active={s.user_vote === "like"}
            count={s.like_count ?? 0}
            onClick={() => onVote("like")}
          />
          <VoteButton
            type="dislike"
            active={s.user_vote === "dislike"}
            count={s.dislike_count ?? 0}
            onClick={() => onVote("dislike")}
          />
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-8 px-2 text-xs"
            onClick={() => setShowComments((v) => !v)}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {totalComments > 0 ? totalComments : ""}
            <span>
              {totalComments === 1 ? "Comment" : "Comments"}
            </span>
          </Button>
        </div>

        {/* Inline composer */}
        <div className="flex items-start gap-2 pt-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary dark:bg-gradient-to-br dark:from-blue-500 dark:to-indigo-600 text-[10px] font-bold text-white shrink-0">
            {getInitials(currentUser.name || "?")}
          </div>
          <div className="flex-1 flex gap-2">
            <Textarea
              rows={1}
              placeholder="Write a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitComment();
                }
              }}
              className="min-h-[36px] text-sm resize-none"
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={submitComment}
              disabled={posting || !commentText.trim()}
            >
              {posting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Comments */}
        {showComments && (s.comments?.length ?? 0) > 0 && (
          <div className="space-y-2 pt-2">
            {(s.comments ?? []).map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                currentUser={currentUser}
                depth={0}
                onReply={(text, parentId) => onAddComment(text, parentId)}
                onVote={(v) => onVoteComment(c.id, v)}
                onVoteChild={(commentId, v) => onVoteComment(commentId, v)}
                onEdit={(commentId, text) => onEditComment(commentId, text)}
                onDelete={(commentId) => onDeleteComment(commentId)}
              />
            ))}
          </div>
        )}
        {!showComments && totalComments > 0 && (
          <button
            onClick={() => setShowComments(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View {totalComments} {totalComments === 1 ? "comment" : "comments"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// CommentItem (recursive)
// ============================================================

interface CommentItemProps {
  comment: SuggestionComment;
  currentUser: User;
  depth: number;
  onReply: (text: string, parentId: string) => void;
  onVote: (vote: VoteType) => void;
  onVoteChild: (commentId: string, vote: VoteType) => void;
  onEdit: (commentId: string, text: string) => void;
  onDelete: (commentId: string) => void;
}

function CommentItem({
  comment: c,
  currentUser,
  depth,
  onReply,
  onVote,
  onVoteChild,
  onEdit,
  onDelete,
}: CommentItemProps) {
  const isAuthor = c.user_id === currentUser.id;
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(c.content);

  // Cap visual nesting at depth 3; deeper replies still render but flat
  const showIndent = depth < 3;

  async function submitReply() {
    if (!replyText.trim()) return;
    onReply(replyText, c.id);
    setReplyText("");
    setReplying(false);
  }

  function submitEdit() {
    if (!editText.trim()) return;
    onEdit(c.id, editText);
    setEditing(false);
  }

  return (
    <div
      className={cn(
        "flex gap-2",
        showIndent && depth > 0 && "ml-6 pl-3 border-l border-border/50"
      )}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold shrink-0">
        {getInitials(c.user?.name || "?")}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="rounded-2xl bg-muted/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold">
              {c.user?.name || "Unknown"}
            </span>
            {isAuthor && (
              <Badge variant="secondary" className="text-[9px] px-1 h-4">
                YOU
              </Badge>
            )}
            {isAuthor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 ml-auto"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(true);
                      setEditText(c.content);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(c.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {editing ? (
            <div className="space-y-2 mt-1">
              <Textarea
                rows={2}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="text-sm resize-none"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={submitEdit}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground/90 whitespace-pre-wrap">
              {c.content}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
          <span>{timeAgo(c.created_at)}</span>
          {c.is_edited && <span>edited</span>}
          <VoteInline
            type="like"
            active={c.user_vote === "like"}
            count={c.like_count ?? 0}
            onClick={() => onVote("like")}
          />
          <VoteInline
            type="dislike"
            active={c.user_vote === "dislike"}
            count={c.dislike_count ?? 0}
            onClick={() => onVote("dislike")}
          />
          <button
            className="font-semibold hover:text-foreground"
            onClick={() => setReplying((v) => !v)}
          >
            Reply
          </button>
        </div>

        {replying && (
          <div className="flex gap-2 pt-1">
            <Textarea
              rows={1}
              placeholder={`Reply to ${c.user?.name ?? "comment"}...`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitReply();
                }
              }}
              className="min-h-[32px] text-sm resize-none"
            />
            <Button
              size="sm"
              className="h-8"
              onClick={submitReply}
              disabled={!replyText.trim()}
            >
              Reply
            </Button>
          </div>
        )}

        {(c.replies?.length ?? 0) > 0 && (
          <div className="space-y-2 pt-1">
            {(c.replies ?? []).map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                currentUser={currentUser}
                depth={depth + 1}
                onReply={onReply}
                onVote={(v) => onVoteChild(r.id, v)}
                onVoteChild={onVoteChild}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Small vote buttons
// ============================================================

function VoteButton({
  type,
  active,
  count,
  onClick,
}: {
  type: VoteType;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = type === "like" ? ThumbsUp : ThumbsDown;
  const activeColor =
    type === "like"
      ? "text-blue-500 bg-blue-500/10 hover:bg-blue-500/20"
      : "text-red-500 bg-red-500/10 hover:bg-red-500/20";
  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn("gap-1.5 h-8 px-2 text-xs", active && activeColor)}
      onClick={onClick}
    >
      <Icon className={cn("h-3.5 w-3.5", active && "fill-current")} />
      {count > 0 && <span>{count}</span>}
    </Button>
  );
}

function VoteInline({
  type,
  active,
  count,
  onClick,
}: {
  type: VoteType;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = type === "like" ? ThumbsUp : ThumbsDown;
  const activeColor = type === "like" ? "text-blue-500" : "text-red-500";
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 font-semibold hover:text-foreground",
        active && activeColor
      )}
    >
      <Icon className={cn("h-3 w-3", active && "fill-current")} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

// ============================================================
// Tree helpers
// ============================================================

function mapCommentsRecursive(
  comments: SuggestionComment[],
  fn: (c: SuggestionComment) => SuggestionComment
): SuggestionComment[] {
  return comments.map((c) => {
    const mapped = fn(c);
    if (mapped.replies && mapped.replies.length > 0) {
      return { ...mapped, replies: mapCommentsRecursive(mapped.replies, fn) };
    }
    return mapped;
  });
}

function removeCommentRecursive(
  comments: SuggestionComment[],
  id: string
): SuggestionComment[] {
  return comments
    .filter((c) => c.id !== id)
    .map((c) => ({
      ...c,
      replies: c.replies ? removeCommentRecursive(c.replies, id) : [],
    }));
}

function countCommentAndDescendants(
  comments: SuggestionComment[],
  id: string
): number {
  for (const c of comments) {
    if (c.id === id) {
      return 1 + countAll(c.replies ?? []);
    }
    const inChild = countCommentAndDescendants(c.replies ?? [], id);
    if (inChild > 0) return inChild;
  }
  return 0;
}

function countAll(comments: SuggestionComment[]): number {
  let n = 0;
  for (const c of comments) {
    n += 1 + countAll(c.replies ?? []);
  }
  return n;
}

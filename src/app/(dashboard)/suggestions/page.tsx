import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SuggestionsContent } from "./suggestions-content";
import type { SuggestionComment, VoteType } from "@/lib/types";

export default async function SuggestionsPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", authUser.id)
    .single();

  if (!user) redirect("/login");

  const [
    { data: suggestions },
    { data: votes },
    { data: comments },
    { data: commentVotes },
  ] = await Promise.all([
    supabase
      .from("suggestions")
      .select("*, user:users(id, name)")
      .order("created_at", { ascending: false }),
    supabase.from("suggestion_upvotes").select("suggestion_id, user_id, vote_type"),
    supabase
      .from("suggestion_comments")
      .select("*, user:users(id, name)")
      .order("created_at", { ascending: true }),
    supabase
      .from("suggestion_comment_votes")
      .select("comment_id, user_id, vote_type"),
  ]);

  // Build comment tree per suggestion
  const commentsBySuggestion = new Map<string, SuggestionComment[]>();
  const allComments: SuggestionComment[] = (comments || []).map((c: any) => {
    const cVotes = (commentVotes || []).filter(
      (v: any) => v.comment_id === c.id
    );
    const mine = cVotes.find((v: any) => v.user_id === user.id);
    return {
      ...c,
      like_count: cVotes.filter((v: any) => v.vote_type === "like").length,
      dislike_count: cVotes.filter((v: any) => v.vote_type === "dislike").length,
      user_vote: (mine?.vote_type as VoteType) ?? null,
      replies: [],
    };
  });

  const byId = new Map(allComments.map((c) => [c.id, c]));
  for (const c of allComments) {
    if (c.parent_id && byId.has(c.parent_id)) {
      byId.get(c.parent_id)!.replies!.push(c);
    } else {
      const list = commentsBySuggestion.get(c.suggestion_id) ?? [];
      list.push(c);
      commentsBySuggestion.set(c.suggestion_id, list);
    }
  }

  const enriched = (suggestions || []).map((s: any) => {
    const sVotes = (votes || []).filter((u: any) => u.suggestion_id === s.id);
    const mine = sVotes.find((u: any) => u.user_id === user.id);
    const sComments = commentsBySuggestion.get(s.id) ?? [];
    const totalComments = allComments.filter(
      (c) => c.suggestion_id === s.id
    ).length;
    return {
      ...s,
      like_count: sVotes.filter((u: any) => u.vote_type === "like").length,
      dislike_count: sVotes.filter((u: any) => u.vote_type === "dislike").length,
      user_vote: (mine?.vote_type as VoteType) ?? null,
      comment_count: totalComments,
      comments: sComments,
    };
  });

  return <SuggestionsContent currentUser={user} initialSuggestions={enriched} />;
}

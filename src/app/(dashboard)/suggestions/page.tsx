import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SuggestionsContent } from "./suggestions-content";

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

  const { data: suggestions } = await supabase
    .from("suggestions")
    .select("*, user:users(id, name)")
    .order("created_at", { ascending: false });

  const { data: upvotes } = await supabase
    .from("suggestion_upvotes")
    .select("suggestion_id, user_id");

  const enriched = (suggestions || []).map((s: any) => {
    const sUpvotes = (upvotes || []).filter(
      (u: any) => u.suggestion_id === s.id
    );
    return {
      ...s,
      upvote_count: sUpvotes.length,
      has_upvoted: sUpvotes.some((u: any) => u.user_id === user.id),
    };
  });

  return <SuggestionsContent currentUser={user} initialSuggestions={enriched} />;
}

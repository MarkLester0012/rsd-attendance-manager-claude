import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SlackToast } from "./slack-toast";
import { DisconnectButton } from "./disconnect-button";

export default async function SlackIntegrationPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect("/login");

  const { data: user } = await supabase
    .from("users")
    .select("id, slack_user_id, slack_team_id")
    .eq("auth_id", authUser.id)
    .single();

  if (!user) redirect("/login");

  const { data: redmineConfig } = await supabase
    .from("redmine_configs")
    .select("default_activity_id")
    .eq("user_id", user.id)
    .single();

  const isLinked = !!user.slack_user_id;
  const hasRedmine = !!redmineConfig;
  const hasDefaultActivity = !!redmineConfig?.default_activity_id;
  const prerequisitesMet = hasRedmine && hasDefaultActivity;

  return (
    <div className="p-6 max-w-2xl">
      <Suspense>
        <SlackToast />
      </Suspense>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Slack Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your Slack account to create Time Logger drafts directly from
          EOD messages using the &ldquo;Log to Time-Logger&rdquo; message shortcut.
        </p>
      </div>

      {/* Prerequisites checklist */}
      <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="text-sm font-semibold">Before you connect</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                hasRedmine
                  ? "bg-green-500/20 text-green-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {hasRedmine ? "✓" : "!"}
            </span>
            <span className={hasRedmine ? "text-muted-foreground" : ""}>
              Configure your Redmine URL and API key in{" "}
              <a
                href="/time-logger"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Time Logger settings
              </a>
              .
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                hasDefaultActivity
                  ? "bg-green-500/20 text-green-400"
                  : "bg-amber-500/20 text-amber-400"
              }`}
            >
              {hasDefaultActivity ? "✓" : "!"}
            </span>
            <span className={hasDefaultActivity ? "text-muted-foreground" : ""}>
              Pick a <strong>default activity</strong> in Time Logger settings —
              every Slack-imported draft uses this activity. Without it, the
              Slack shortcut will reject your message.
            </span>
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              isLinked ? "bg-green-500" : "bg-zinc-500"
            }`}
          />
          <span className="text-sm font-medium">
            {isLinked ? "Connected" : "Not connected"}
          </span>
        </div>

        {isLinked ? (
          <>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground font-medium">Slack User ID:</span>{" "}
                {user.slack_user_id}
              </p>
              {user.slack_team_id && (
                <p>
                  <span className="text-foreground font-medium">Workspace ID:</span>{" "}
                  {user.slack_team_id}
                </p>
              )}
            </div>
            <DisconnectButton />
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Click the button below to authorize this app in your Slack workspace.
              You only need to do this once.
            </p>
            {!prerequisitesMet && (
              <p className="text-xs text-amber-400">
                Finish the prerequisites above first — otherwise the integration
                won&apos;t be able to create drafts.
              </p>
            )}
            <a
              href="/api/slack/oauth/install"
              aria-disabled={!prerequisitesMet}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                prerequisitesMet
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "pointer-events-none bg-primary/40 text-primary-foreground/60"
              }`}
            >
              Connect Slack
            </a>
          </>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="text-sm font-semibold">How to use</h2>
        <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1.5">
          <li>Post your EOD update in Slack as usual.</li>
          <li>
            Hover the message, click the <strong>⋯</strong> menu, and select{" "}
            <strong>Log to Time-Logger</strong>.
          </li>
          <li>Drafts appear in Time Logger within a few seconds.</li>
          <li>Review, adjust hours, and submit to Redmine.</li>
        </ol>
        <p className="text-xs text-muted-foreground pt-1">
          Requires the <strong>Log to Time-Logger</strong> shortcut to be installed
          in your Slack workspace by an admin.
        </p>
      </div>
    </div>
  );
}

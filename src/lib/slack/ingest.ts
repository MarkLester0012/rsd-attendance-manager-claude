import { createAdminClient } from "@/lib/supabase/admin";
import { decryptApiKey } from "@/lib/redmine/encryption";
import { getIssueDetails } from "@/lib/redmine/client";
import { parseSlackEOD } from "@/lib/redmine/parser";
import { postResponseUrl } from "@/lib/slack/client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function ingestSlackEOD(
  userId: string,
  text: string,
  responseUrl: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data: config } = await supabase
    .from("redmine_configs")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!config) {
    await postResponseUrl(responseUrl, {
      text: "Configure Redmine at <" + APP_URL + "/time-logger|Time Logger settings> before using Slack import.",
    });
    return;
  }

  if (!config.default_activity_id) {
    await postResponseUrl(responseUrl, {
      text: "Pick a default activity in <" + APP_URL + "/time-logger|Time Logger settings> before using Slack import.",
    });
    return;
  }

  const apiKey = decryptApiKey(
    config.encrypted_api_key,
    config.encryption_iv,
    config.encryption_tag
  );

  const opts = { redmineUrl: config.redmine_url, apiKey };
  const entries = parseSlackEOD(text);

  if (entries.length === 0) {
    await postResponseUrl(responseUrl, {
      text: "No ticket entries found in that message.",
    });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  const results = await Promise.all(
    entries.map((entry) => getIssueDetails(opts, entry.issueId))
  );

  const rows = results.map((result, i) => {
    const entry = entries[i];
    if (result.issue) {
      return {
        user_id: userId,
        log_date: today,
        issue_id: entry.issueId,
        project_name: result.issue.project.name,
        hours: 1,
        activity_id: config.default_activity_id,
        activity_name: null,
        comment: entry.description || null,
        status: "draft" as const,
        error_message: null,
      };
    } else {
      return {
        user_id: userId,
        log_date: today,
        issue_id: entry.issueId,
        project_name: null,
        hours: 1,
        activity_id: config.default_activity_id,
        activity_name: null,
        comment: entry.description || null,
        status: "failed" as const,
        error_message: result.error || "Failed to fetch issue",
      };
    }
  });

  await supabase.from("time_log_entries").insert(rows);

  const draftCount = rows.filter((r) => r.status === "draft").length;
  const failedCount = rows.filter((r) => r.status === "failed").length;

  const failedPart = failedCount > 0 ? ` (${failedCount} failed)` : "";
  await postResponseUrl(responseUrl, {
    text: `✅ Created ${draftCount} draft${draftCount !== 1 ? "s" : ""}${failedPart}. Open <${APP_URL}/time-logger|Time Logger> to review.`,
  });
}

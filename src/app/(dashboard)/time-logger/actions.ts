"use server";

import { createClient } from "@/lib/supabase/server";
import { encryptApiKey, decryptApiKey } from "@/lib/redmine/encryption";
import * as redmine from "@/lib/redmine/client";
import type { RedmineActivity, RedmineIssueDetails, TimeLogEntry } from "@/lib/types";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", authUser.id)
    .single();

  return user;
}

async function getDecryptedConfig(userId: string) {
  const supabase = await createClient();
  const { data: config } = await supabase
    .from("redmine_configs")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!config) return null;

  const apiKey = decryptApiKey(
    config.encrypted_api_key,
    config.encryption_iv,
    config.encryption_tag
  );

  return {
    redmineUrl: config.redmine_url,
    apiKey,
    defaultActivityId: config.default_activity_id,
  };
}

// --- Config actions ---

export async function saveRedmineConfig(input: {
  redmine_url: string;
  api_key: string;
  default_activity_id?: number;
}) {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "Not authenticated" };

  const { encrypted, iv, tag } = encryptApiKey(input.api_key);

  const supabase = await createClient();
  const { error } = await supabase.from("redmine_configs").upsert(
    {
      user_id: user.id,
      redmine_url: input.redmine_url.replace(/\/$/, ""),
      encrypted_api_key: encrypted,
      encryption_iv: iv,
      encryption_tag: tag,
      default_activity_id: input.default_activity_id || null,
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };
  return { success: true };
}

export async function testRedmineConnection(): Promise<{
  success: boolean;
  login?: string;
  error?: string;
}> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const config = await getDecryptedConfig(user.id);
  if (!config) return { success: false, error: "Redmine not configured" };

  return redmine.testConnection(config);
}

export async function fetchActivities(): Promise<{
  activities: RedmineActivity[];
  error?: string;
}> {
  const user = await getAuthenticatedUser();
  if (!user) return { activities: [], error: "Not authenticated" };

  const config = await getDecryptedConfig(user.id);
  if (!config) return { activities: [], error: "Redmine not configured" };

  return redmine.getActivities(config);
}

// --- Issue details ---

export async function fetchIssueDetails(
  issueIds: number[]
): Promise<{
  issues: RedmineIssueDetails[];
  errors: Array<{ issueId: number; error: string }>;
}> {
  const user = await getAuthenticatedUser();
  if (!user) return { issues: [], errors: [{ issueId: 0, error: "Not authenticated" }] };

  const config = await getDecryptedConfig(user.id);
  if (!config) return { issues: [], errors: [{ issueId: 0, error: "Redmine not configured" }] };

  const results = await Promise.all(
    issueIds.map((id) => redmine.getIssueDetails(config, id))
  );

  const issues: RedmineIssueDetails[] = [];
  const errors: Array<{ issueId: number; error: string }> = [];

  results.forEach((result, index) => {
    if (result.issue) {
      issues.push(result.issue);
    } else {
      errors.push({ issueId: issueIds[index], error: result.error || "Unknown error" });
    }
  });

  return { issues, errors };
}

// --- Two-way sync ---

export async function fetchExistingRedmineEntries(date: string): Promise<{
  entries: Array<{
    id: number;
    issue_id: number;
    project_name: string;
    hours: number;
    activity_id: number;
    activity_name: string;
    comments: string;
  }>;
  error?: string;
}> {
  const user = await getAuthenticatedUser();
  if (!user) return { entries: [], error: "Not authenticated" };

  const config = await getDecryptedConfig(user.id);
  if (!config) return { entries: [], error: "Redmine not configured" };

  return redmine.getTimeEntries(config, date);
}

// --- Draft CRUD ---

export async function saveDraftEntries(
  entries: Array<{
    id?: string;
    log_date: string;
    issue_id: number;
    project_name?: string;
    hours: number;
    activity_id: number;
    activity_name?: string;
    comment?: string;
    custom_fields?: Record<string, unknown>;
  }>
): Promise<{ success: boolean; entries?: TimeLogEntry[]; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const rows = entries.map((e) => ({
    ...(e.id ? { id: e.id } : {}),
    user_id: user.id,
    log_date: e.log_date,
    issue_id: e.issue_id,
    project_name: e.project_name || null,
    hours: e.hours,
    activity_id: e.activity_id,
    activity_name: e.activity_name || null,
    comment: e.comment || null,
    status: "draft" as const,
    custom_fields: e.custom_fields || null,
  }));

  const { data, error } = await supabase
    .from("time_log_entries")
    .upsert(rows, { onConflict: "id" })
    .select();

  if (error) return { success: false, error: error.message };
  return { success: true, entries: data };
}

export async function deleteEntry(
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_log_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// --- Submission ---

export async function submitToRedmine(
  entryIds: string[]
): Promise<{
  results: Array<{
    entryId: string;
    success: boolean;
    redmineId?: number;
    error?: string;
  }>;
}> {
  const user = await getAuthenticatedUser();
  if (!user) return { results: entryIds.map((id) => ({ entryId: id, success: false, error: "Not authenticated" })) };

  const config = await getDecryptedConfig(user.id);
  if (!config) return { results: entryIds.map((id) => ({ entryId: id, success: false, error: "Redmine not configured" })) };

  const supabase = await createClient();

  // Fetch the entries to submit
  const { data: entries, error: fetchError } = await supabase
    .from("time_log_entries")
    .select("*")
    .in("id", entryIds)
    .eq("user_id", user.id);

  if (fetchError || !entries) {
    return { results: entryIds.map((id) => ({ entryId: id, success: false, error: "Failed to fetch entries" })) };
  }

  // Submit each entry individually
  const results = await Promise.all(
    entries.map(async (entry) => {
      const customFields = entry.custom_fields
        ? Object.entries(entry.custom_fields as Record<string, string>).map(
            ([id, value]) => ({ id: parseInt(id, 10), value })
          )
        : undefined;

      const result = await redmine.createTimeEntry(config, {
        issue_id: entry.issue_id,
        spent_on: entry.log_date,
        hours: entry.hours,
        activity_id: entry.activity_id,
        comments: entry.comment || undefined,
        custom_fields: customFields,
      });

      if (result.id) {
        // Update local entry as submitted
        await supabase
          .from("time_log_entries")
          .update({
            status: "submitted",
            redmine_time_entry_id: result.id,
            error_message: null,
          })
          .eq("id", entry.id);

        return { entryId: entry.id, success: true, redmineId: result.id };
      } else {
        // Mark as failed
        await supabase
          .from("time_log_entries")
          .update({
            status: "failed",
            error_message: result.error,
          })
          .eq("id", entry.id);

        return { entryId: entry.id, success: false, error: result.error };
      }
    })
  );

  return { results };
}

export async function retryFailedEntries(
  entryIds: string[]
): Promise<{
  results: Array<{
    entryId: string;
    success: boolean;
    redmineId?: number;
    error?: string;
  }>;
}> {
  // Reset failed entries to draft, then submit
  const user = await getAuthenticatedUser();
  if (!user) return { results: [] };

  const supabase = await createClient();
  await supabase
    .from("time_log_entries")
    .update({ status: "draft", error_message: null })
    .in("id", entryIds)
    .eq("user_id", user.id);

  return submitToRedmine(entryIds);
}

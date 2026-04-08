import type { RedmineActivity, RedmineIssueDetails } from "@/lib/types";

interface RedmineRequestOptions {
  redmineUrl: string;
  apiKey: string;
}

async function redmineFetch(
  opts: RedmineRequestOptions,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${opts.redmineUrl.replace(/\/$/, "")}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      "X-Redmine-API-Key": opts.apiKey,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function testConnection(
  opts: RedmineRequestOptions
): Promise<{ success: boolean; login?: string; error?: string }> {
  try {
    const res = await redmineFetch(opts, "/users/current.json");
    if (!res.ok) {
      return {
        success: false,
        error: res.status === 401 ? "Invalid API key" : `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    return { success: true, login: data.user?.login };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Connection failed",
    };
  }
}

export async function getActivities(
  opts: RedmineRequestOptions
): Promise<{ activities: RedmineActivity[]; error?: string }> {
  try {
    const res = await redmineFetch(
      opts,
      "/enumerations/time_entry_activities.json"
    );
    if (!res.ok) {
      if (res.status === 404) {
        return {
          activities: [],
          error:
            "Activities endpoint not available. Your Redmine version may not support this.",
        };
      }
      return { activities: [], error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      activities: (data.time_entry_activities || []).map(
        (a: { id: number; name: string; is_default?: boolean }) => ({
          id: a.id,
          name: a.name,
          is_default: a.is_default,
        })
      ),
    };
  } catch (e) {
    return {
      activities: [],
      error: e instanceof Error ? e.message : "Failed to fetch activities",
    };
  }
}

export async function getIssueDetails(
  opts: RedmineRequestOptions,
  issueId: number
): Promise<{ issue?: RedmineIssueDetails; error?: string }> {
  try {
    const res = await redmineFetch(opts, `/issues/${issueId}.json`);
    if (!res.ok) {
      return {
        error:
          res.status === 404
            ? `Issue #${issueId} not found`
            : `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    return {
      issue: {
        id: data.issue.id,
        subject: data.issue.subject,
        project: {
          id: data.issue.project.id,
          name: data.issue.project.name,
        },
      },
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to fetch issue",
    };
  }
}

export async function getTimeEntries(
  opts: RedmineRequestOptions,
  date: string
): Promise<{
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
  try {
    const res = await redmineFetch(
      opts,
      `/time_entries.json?user_id=me&from=${date}&to=${date}&limit=100`
    );
    if (!res.ok) {
      return { entries: [], error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      entries: (data.time_entries || []).map(
        (e: {
          id: number;
          issue?: { id: number };
          project: { name: string };
          hours: number;
          activity: { id: number; name: string };
          comments: string;
        }) => ({
          id: e.id,
          issue_id: e.issue?.id,
          project_name: e.project.name,
          hours: e.hours,
          activity_id: e.activity.id,
          activity_name: e.activity.name,
          comments: e.comments,
        })
      ),
    };
  } catch (e) {
    return {
      entries: [],
      error: e instanceof Error ? e.message : "Failed to fetch time entries",
    };
  }
}

export async function createTimeEntry(
  opts: RedmineRequestOptions,
  data: {
    issue_id: number;
    spent_on: string;
    hours: number;
    activity_id: number;
    comments?: string;
    custom_fields?: Array<{ id: number; value: string }>;
  }
): Promise<{ id?: number; error?: string }> {
  try {
    const res = await redmineFetch(opts, "/time_entries.json", {
      method: "POST",
      body: JSON.stringify({ time_entry: data }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      const errors = errorData?.errors?.join(", ") || `HTTP ${res.status}`;
      return { error: errors };
    }
    const result = await res.json();
    return { id: result.time_entry.id };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create time entry",
    };
  }
}

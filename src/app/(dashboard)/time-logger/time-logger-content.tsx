"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/time-logger/settings-dialog";
import { PasteDialog } from "@/components/time-logger/paste-dialog";
import { DateNav } from "@/components/time-logger/date-nav";
import { HoursSummary } from "@/components/time-logger/hours-summary";
import { EntryTable, type DraftEntry } from "@/components/time-logger/entry-table";
import {
  fetchActivities,
  fetchIssueDetails,
  fetchExistingRedmineEntries,
  saveDraftEntries,
  submitToRedmine,
} from "./actions";
import type { User, TimeLogEntry, RedmineActivity, ParsedSlackEntry } from "@/lib/types";
import { Settings, ClipboardPaste, Send, Save, Loader2 } from "lucide-react";

interface TimeLoggerContentProps {
  currentUser: User;
  hasConfig: boolean;
  defaultActivityId: number | null;
  initialEntries: TimeLogEntry[];
  initialDate: string;
}

function toEntryFromDB(e: TimeLogEntry): DraftEntry {
  return {
    id: e.id,
    issue_id: e.issue_id,
    project_name: e.project_name || "",
    hours: e.hours,
    activity_id: e.activity_id,
    activity_name: e.activity_name || "",
    comment: e.comment || "",
    status: e.status,
    redmine_time_entry_id: e.redmine_time_entry_id,
    error_message: e.error_message,
  };
}

export function TimeLoggerContent({
  currentUser,
  hasConfig: initialHasConfig,
  defaultActivityId,
  initialEntries,
  initialDate,
}: TimeLoggerContentProps) {
  const [hasConfig, setHasConfig] = useState(initialHasConfig);
  const [settingsOpen, setSettingsOpen] = useState(!initialHasConfig);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [date, setDate] = useState(new Date(initialDate + "T00:00:00"));
  const [entries, setEntries] = useState<DraftEntry[]>(
    initialEntries.map(toEntryFromDB)
  );
  const [activities, setActivities] = useState<RedmineActivity[]>([]);
  const [existingRedmineEntries, setExistingRedmineEntries] = useState<
    Array<{
      id: number;
      issue_id: number;
      project_name: string;
      hours: number;
      activity_id: number;
      activity_name: string;
      comments: string;
    }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Load activities on mount
  useEffect(() => {
    if (hasConfig) {
      fetchActivities().then((result) => {
        if (result.activities.length > 0) {
          setActivities(result.activities);
        }
        if (result.error) {
          toast.error(`Activities: ${result.error}`);
        }
      });
    }
  }, [hasConfig]);

  // Load existing Redmine entries when date changes
  const loadDateEntries = useCallback(
    async (newDate: Date) => {
      if (!hasConfig) return;
      setLoadingEntries(true);
      const dateStr = format(newDate, "yyyy-MM-dd");

      const [redmineResult] = await Promise.all([
        fetchExistingRedmineEntries(dateStr),
      ]);

      if (redmineResult.entries) {
        // Filter out entries that we already have locally as "submitted"
        const localSubmittedIds = new Set(
          entries
            .filter((e) => e.redmine_time_entry_id)
            .map((e) => e.redmine_time_entry_id)
        );
        setExistingRedmineEntries(
          redmineResult.entries.filter((e) => !localSubmittedIds.has(e.id))
        );
      }
      setLoadingEntries(false);
    },
    [hasConfig, entries]
  );

  // Handle date change
  async function handleDateChange(newDate: Date) {
    setDate(newDate);
    setEntries([]);
    setExistingRedmineEntries([]);
    await loadDateEntries(newDate);
  }

  // Fetch issue details when user tabs away from issue field
  async function handleIssueBlur(index: number, issueId: number) {
    const result = await fetchIssueDetails([issueId]);
    if (result.issues.length > 0) {
      const issue = result.issues[0];
      const updated = [...entries];
      updated[index] = {
        ...updated[index],
        project_name: issue.project.name,
      };
      setEntries(updated);
    }
    if (result.errors.length > 0) {
      toast.error(result.errors[0].error);
    }
  }

  // Handle parsed Slack entries
  async function handleParsedEntries(parsed: ParsedSlackEntry[]) {
    const defaultActivity = activities.find((a) => a.is_default) || activities[0];

    const newEntries: DraftEntry[] = parsed.map((p) => ({
      issue_id: p.issueId,
      project_name: "",
      hours: 1,
      activity_id: defaultActivityId || defaultActivity?.id || "",
      activity_name: defaultActivity?.name || "",
      comment: p.description,
      status: "draft" as const,
      redmine_time_entry_id: null,
      error_message: null,
    }));

    setEntries((prev) => [...prev, ...newEntries]);

    // Fetch issue details for all parsed entries
    const issueIds = parsed.map((p) => p.issueId);
    const result = await fetchIssueDetails(issueIds);

    if (result.issues.length > 0) {
      setEntries((prev) => {
        const updated = [...prev];
        for (const issue of result.issues) {
          const idx = updated.findIndex(
            (e) => e.issue_id === issue.id && !e.project_name
          );
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              project_name: issue.project.name,
            };
          }
        }
        return updated;
      });
    }
  }

  // Save drafts
  async function handleSaveDrafts() {
    const drafts = entries.filter(
      (e) =>
        e.status === "draft" &&
        typeof e.issue_id === "number" &&
        typeof e.hours === "number" &&
        typeof e.activity_id === "number"
    );

    if (drafts.length === 0) {
      toast.error("No valid draft entries to save");
      return;
    }

    setSaving(true);
    const result = await saveDraftEntries(
      drafts.map((e) => ({
        id: e.id,
        log_date: format(date, "yyyy-MM-dd"),
        issue_id: e.issue_id as number,
        project_name: e.project_name,
        hours: e.hours as number,
        activity_id: e.activity_id as number,
        activity_name: e.activity_name,
        comment: e.comment,
      }))
    );
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.entries) {
      // Update local entries with saved IDs
      setEntries((prev) => {
        const updated = [...prev];
        for (const saved of result.entries!) {
          const idx = updated.findIndex(
            (e) =>
              e.issue_id === saved.issue_id &&
              (!e.id || e.id === saved.id)
          );
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], id: saved.id };
          }
        }
        return updated;
      });
    }

    toast.success(`Saved ${drafts.length} draft entries`);
  }

  // Submit to Redmine
  async function handleSubmit() {
    const toSubmit = entries.filter(
      (e) =>
        (e.status === "draft" || e.status === "failed") &&
        e.id &&
        typeof e.issue_id === "number" &&
        typeof e.hours === "number" &&
        typeof e.activity_id === "number"
    );

    if (toSubmit.length === 0) {
      // Try saving first if there are unsaved drafts
      const unsaved = entries.filter(
        (e) =>
          e.status === "draft" &&
          !e.id &&
          typeof e.issue_id === "number" &&
          typeof e.hours === "number"
      );
      if (unsaved.length > 0) {
        toast.error("Save drafts first before submitting");
        return;
      }
      toast.error("No entries to submit");
      return;
    }

    setSubmitting(true);

    // Mark entries as submitting
    setEntries((prev) =>
      prev.map((e) =>
        toSubmit.some((s) => s.id === e.id)
          ? { ...e, status: "submitting" as const }
          : e
      )
    );

    const result = await submitToRedmine(toSubmit.map((e) => e.id!));

    // Update entries with results
    setEntries((prev) =>
      prev.map((e) => {
        const r = result.results.find((r) => r.entryId === e.id);
        if (!r) return e;
        return {
          ...e,
          status: r.success ? ("submitted" as const) : ("failed" as const),
          redmine_time_entry_id: r.redmineId || e.redmine_time_entry_id,
          error_message: r.error || null,
        };
      })
    );

    setSubmitting(false);

    const successCount = result.results.filter((r) => r.success).length;
    const failCount = result.results.filter((r) => !r.success).length;

    if (failCount === 0) {
      toast.success(`Submitted ${successCount} entries to Redmine`);
    } else {
      toast.error(
        `${successCount} succeeded, ${failCount} failed. Check errors and retry.`
      );
    }
  }

  // Computed values
  const draftHours = entries.reduce(
    (sum, e) => sum + (typeof e.hours === "number" ? e.hours : 0),
    0
  );
  const existingHours = existingRedmineEntries.reduce(
    (sum, e) => sum + e.hours,
    0
  );
  const totalHours = draftHours + existingHours;
  const submittedCount = entries.filter((e) => e.status === "submitted").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;
  const hasDrafts = entries.some((e) => e.status === "draft");
  const hasSubmittable = entries.some(
    (e) =>
      (e.status === "draft" || e.status === "failed") &&
      e.id &&
      typeof e.hours === "number" &&
      typeof e.issue_id === "number"
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time Logger"
        description="Log your Redmine manhours quickly"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </PageHeader>

      {!hasConfig ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Settings className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Configure Redmine</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your Redmine URL and API key to get started.
          </p>
          <Button onClick={() => setSettingsOpen(true)}>
            Set Up Redmine
          </Button>
        </div>
      ) : (
        <>
          {/* Date navigation + actions */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <DateNav date={date} onDateChange={handleDateChange} />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPasteOpen(true)}
              >
                <ClipboardPaste className="h-4 w-4 mr-2" />
                Paste EOD
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDrafts}
                disabled={saving || !hasDrafts}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Drafts
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || !hasSubmittable}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit to Redmine
              </Button>
            </div>
          </div>

          {/* Hours summary */}
          <HoursSummary
            totalHours={totalHours}
            entryCount={entries.length + existingRedmineEntries.length}
            submittedCount={submittedCount + existingRedmineEntries.length}
            failedCount={failedCount}
          />

          {/* Entry table */}
          {loadingEntries ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading entries...
            </div>
          ) : (
            <EntryTable
              entries={entries}
              activities={activities}
              onEntriesChange={setEntries}
              onIssueBlur={handleIssueBlur}
              existingRedmineEntries={existingRedmineEntries}
            />
          )}
        </>
      )}

      {/* Dialogs */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onConfigSaved={() => {
          setHasConfig(true);
          // Reload activities
          fetchActivities().then((result) => {
            if (result.activities.length > 0) {
              setActivities(result.activities);
            }
          });
        }}
      />
      <PasteDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onEntriesParsed={handleParsedEntries}
      />
    </div>
  );
}

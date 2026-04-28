"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { TimeLogEntry, RedmineActivity } from "@/lib/types";
import { deleteEntry } from "@/app/(dashboard)/time-logger/actions";

export interface DraftEntry {
  id?: string;
  issue_id: number | "";
  project_name: string;
  hours: number | "";
  activity_id: number | "";
  activity_name: string;
  comment: string;
  status: "draft" | "submitted" | "failed" | "submitting";
  redmine_time_entry_id: number | null;
  error_message: string | null;
}

interface EntryTableProps {
  entries: DraftEntry[];
  activities: RedmineActivity[];
  onEntriesChange: (entries: DraftEntry[]) => void;
  onIssueBlur: (index: number, issueId: number) => void;
  existingRedmineEntries: Array<{
    id: number;
    issue_id: number;
    project_name: string;
    hours: number;
    activity_name: string;
    comments: string;
  }>;
}

export function EntryTable({
  entries,
  activities,
  onEntriesChange,
  onIssueBlur,
  existingRedmineEntries,
}: EntryTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function updateEntry(index: number, updates: Partial<DraftEntry>) {
    const updated = [...entries];
    updated[index] = { ...updated[index], ...updates };
    onEntriesChange(updated);
  }

  function addEmptyRow() {
    onEntriesChange([
      ...entries,
      {
        issue_id: "",
        project_name: "",
        hours: 1,
        activity_id: activities.find((a) => a.is_default)?.id || "",
        activity_name: activities.find((a) => a.is_default)?.name || "",
        comment: "",
        status: "draft",
        redmine_time_entry_id: null,
        error_message: null,
      },
    ]);
  }

  async function handleDelete(index: number) {
    const entry = entries[index];
    if (entry.id) {
      setDeletingId(entry.id);
      const result = await deleteEntry(entry.id);
      setDeletingId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
    }
    const updated = entries.filter((_, i) => i !== index);
    onEntriesChange(updated);
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
    index: number,
    field: string
  ) {
    if (e.key === "Enter" && field === "comment") {
      e.preventDefault();
      if (index === entries.length - 1) {
        addEmptyRow();
        // Focus will happen on next render
        setTimeout(() => {
          const inputs = document.querySelectorAll<HTMLInputElement>(
            '[data-field="issue_id"]'
          );
          inputs[inputs.length - 1]?.focus();
        }, 50);
      }
    }
  }

  function handleIssueBlur(index: number) {
    const issueId = entries[index].issue_id;
    if (typeof issueId === "number" && issueId > 0) {
      onIssueBlur(index, issueId);
    }
  }

  const statusIcon = (entry: DraftEntry) => {
    switch (entry.status) {
      case "submitted":
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <CheckCircle2 className="h-4 w-4 text-green-400" />
              </TooltipTrigger>
              <TooltipContent>
                Submitted (Redmine #{entry.redmine_time_entry_id})
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case "failed":
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <XCircle className="h-4 w-4 text-destructive" />
              </TooltipTrigger>
              <TooltipContent>{entry.error_message}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case "submitting":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[640px] space-y-3">
      {/* Header */}
      <div className="grid grid-cols-[80px_1fr_80px_160px_1fr_40px_40px] gap-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <div>Issue #</div>
        <div>Project</div>
        <div>Hours</div>
        <div>Activity</div>
        <div>Comment</div>
        <div></div>
        <div></div>
      </div>

      {/* Existing Redmine entries (read-only) */}
      {existingRedmineEntries.map((entry) => (
        <div
          key={`redmine-${entry.id}`}
          className="grid grid-cols-[80px_1fr_80px_160px_1fr_40px_40px] gap-2 items-center rounded-lg border border-border/30 bg-muted/20 px-2 py-2 opacity-60"
        >
          <div className="text-sm font-mono min-w-0 truncate">#{entry.issue_id}</div>
          <div className="text-sm text-muted-foreground min-w-0 truncate">
            {entry.project_name}
          </div>
          <div className="text-sm tabular-nums min-w-0">{entry.hours}h</div>
          <div className="text-sm text-muted-foreground min-w-0 truncate">
            {entry.activity_name}
          </div>
          <div className="text-sm text-muted-foreground min-w-0 truncate">
            {entry.comments}
          </div>
          <div className="flex justify-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                </TooltipTrigger>
                <TooltipContent>Synced to Redmine</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div />
        </div>
      ))}

      {/* Editable entries */}
      {entries.map((entry, index) => (
        <div
          key={entry.id || `draft-${index}`}
          className={cn(
            "grid grid-cols-[80px_1fr_80px_160px_1fr_40px_40px] gap-2 items-center rounded-lg border px-2 py-1.5 transition-colors",
            entry.status === "submitted"
              ? "border-green-500/20 bg-green-500/5"
              : entry.status === "failed"
              ? "border-destructive/20 bg-destructive/5"
              : "border-border/50 bg-card/50"
          )}
        >
          <Input
            data-field="issue_id"
            type="number"
            placeholder="#"
            value={entry.issue_id}
            onChange={(e) =>
              updateEntry(index, {
                issue_id: e.target.value ? parseInt(e.target.value, 10) : "",
              })
            }
            onBlur={() => handleIssueBlur(index)}
            className="h-8 font-mono text-sm"
            disabled={entry.status === "submitted"}
          />
          <div className="text-sm text-muted-foreground truncate px-1 min-w-0">
            {entry.project_name || (
              <span className="text-muted-foreground/40 italic">
                auto-filled
              </span>
            )}
          </div>
          <Input
            type="number"
            step="0.25"
            min="0.25"
            max="24"
            placeholder="0"
            value={entry.hours}
            onChange={(e) =>
              updateEntry(index, {
                hours: e.target.value ? parseFloat(e.target.value) : "",
              })
            }
            className="h-8 text-sm tabular-nums"
            disabled={entry.status === "submitted"}
          />
          <Select
            value={entry.activity_id ? String(entry.activity_id) : undefined}
            onValueChange={(val) => {
              const activity = activities.find((a) => a.id === parseInt(val, 10));
              updateEntry(index, {
                activity_id: parseInt(val, 10),
                activity_name: activity?.name || "",
              });
            }}
            disabled={entry.status === "submitted"}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Activity" />
            </SelectTrigger>
            <SelectContent>
              {activities.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Comment (optional)"
            value={entry.comment}
            onChange={(e) => updateEntry(index, { comment: e.target.value })}
            onKeyDown={(e) => handleKeyDown(e, index, "comment")}
            className="h-8 text-sm"
            disabled={entry.status === "submitted"}
          />
          <div className="flex justify-center">{statusIcon(entry)}</div>
          <div className="flex justify-center">
            {entry.status === "failed" ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-yellow-400 hover:text-yellow-300"
                      onClick={() => updateEntry(index, { status: "draft", error_message: null })}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset to draft for retry</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : entry.status !== "submitted" ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(index)}
                disabled={deletingId === entry.id}
              >
                {deletingId === entry.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
          </div>
        </div>
      ))}
        </div>
      </div>

      {/* Add row button */}
      <Button
        variant="outline"
        className="w-full border-dashed"
        onClick={addEmptyRow}
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Entry
      </Button>
    </div>
  );
}

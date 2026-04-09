"use client";

import { useState } from "react";
import { format, eachDayOfInterval, isWeekend } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CalendarRange,
  CalendarDays,
  CalendarIcon,
  Save,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RedmineActivity } from "@/lib/types";

interface BulkApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activities: RedmineActivity[];
  defaultActivityId: number | null;
  onBulkApply: (
    entry: {
      issue_id: number;
      hours: number;
      activity_id: number;
      activity_name: string;
      comment: string;
    },
    dates: string[]
  ) => Promise<string[]>;
  onBulkSubmit: (entryIds: string[]) => Promise<void>;
}

export function BulkApplyDialog({
  open,
  onOpenChange,
  activities,
  defaultActivityId,
  onBulkApply,
  onBulkSubmit,
}: BulkApplyDialogProps) {
  const defaultActivity = activities.find((a) => a.is_default) || activities[0];

  const [issueId, setIssueId] = useState("");
  const [hours, setHours] = useState("1");
  const [activityId, setActivityId] = useState<string>(
    String(defaultActivityId || defaultActivity?.id || "")
  );
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Range mode
  const [rangeFrom, setRangeFrom] = useState<Date | undefined>(undefined);
  const [rangeTo, setRangeTo] = useState<Date | undefined>(undefined);

  // Pick mode
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);

  const [mode, setMode] = useState<string>("range");

  function getSelectedDateStrings(): string[] {
    if (mode === "range" && rangeFrom && rangeTo) {
      if (rangeFrom > rangeTo) return [];
      return eachDayOfInterval({ start: rangeFrom, end: rangeTo })
        .filter((d) => !isWeekend(d))
        .map((d) => format(d, "yyyy-MM-dd"));
    }
    if (mode === "pick") {
      return selectedDates
        .sort((a, b) => a.getTime() - b.getTime())
        .map((d) => format(d, "yyyy-MM-dd"));
    }
    return [];
  }

  const dateStrings = getSelectedDateStrings();
  const isValid =
    issueId &&
    parseInt(issueId, 10) > 0 &&
    hours &&
    parseFloat(hours) > 0 &&
    activityId &&
    dateStrings.length > 0;

  function getEntryPayload() {
    const activity = activities.find((a) => a.id === parseInt(activityId, 10));
    return {
      issue_id: parseInt(issueId, 10),
      hours: parseFloat(hours),
      activity_id: parseInt(activityId, 10),
      activity_name: activity?.name || "",
      comment,
    };
  }

  async function handleSaveDrafts() {
    if (!isValid) return;
    setSaving(true);
    await onBulkApply(getEntryPayload(), dateStrings);
    setSaving(false);
    handleClose(false);
  }

  async function handleSaveAndSubmit() {
    if (!isValid) return;
    setSaving(true);
    const entryIds = await onBulkApply(getEntryPayload(), dateStrings);
    setSaving(false);

    if (entryIds.length === 0) return;

    setSubmitting(true);
    await onBulkSubmit(entryIds);
    setSubmitting(false);
    handleClose(false);
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setIssueId("");
      setHours("1");
      setActivityId(
        String(defaultActivityId || defaultActivity?.id || "")
      );
      setComment("");
      setRangeFrom(undefined);
      setRangeTo(undefined);
      setSelectedDates([]);
    }
    onOpenChange(isOpen);
  }

  const busy = saving || submitting;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Apply Entry</DialogTitle>
          <DialogDescription>
            Apply the same time entry across multiple dates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Entry fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-issue" className="text-xs">Issue #</Label>
              <Input
                id="bulk-issue"
                type="number"
                placeholder="e.g. 83323"
                value={issueId}
                onChange={(e) => setIssueId(e.target.value)}
                className="h-8 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-hours" className="text-xs">Hours</Label>
              <Input
                id="bulk-hours"
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="h-8 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Activity</Label>
            <Select value={activityId} onValueChange={setActivityId}>
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-comment" className="text-xs">Comment (optional)</Label>
            <Input
              id="bulk-comment"
              placeholder="Comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Date selection */}
          <Tabs value={mode} onValueChange={setMode}>
            <TabsList className="w-full">
              <TabsTrigger value="range" className="flex-1 gap-1.5">
                <CalendarRange className="h-3.5 w-3.5" />
                Date Range
              </TabsTrigger>
              <TabsTrigger value="pick" className="flex-1 gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Pick Dates
              </TabsTrigger>
            </TabsList>

            <TabsContent value="range">
              <div className="flex items-center gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "flex-1 justify-start gap-2 text-sm",
                        rangeFrom && "border-primary/40 text-primary"
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {rangeFrom
                        ? format(rangeFrom, "MMM d, yyyy")
                        : "From date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={rangeFrom}
                      onSelect={setRangeFrom}
                    />
                  </PopoverContent>
                </Popover>

                <span className="text-muted-foreground text-sm">to</span>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "flex-1 justify-start gap-2 text-sm",
                        rangeTo && "border-primary/40 text-primary"
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {rangeTo
                        ? format(rangeTo, "MMM d, yyyy")
                        : "To date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={rangeTo}
                      onSelect={setRangeTo}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              {mode === "range" && dateStrings.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {dateStrings.length} weekday{dateStrings.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </TabsContent>

            <TabsContent value="pick">
              <div className="flex justify-center">
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={(dates) => setSelectedDates(dates || [])}
                  className="rounded-md border border-border/50"
                />
              </div>
              {selectedDates.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedDates
                    .sort((a, b) => a.getTime() - b.getTime())
                    .map((d) => (
                      <Badge
                        key={d.toISOString()}
                        variant="secondary"
                        className="text-xs"
                      >
                        {format(d, "MMM d")}
                      </Badge>
                    ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveDrafts}
              disabled={!isValid || busy}
            >
              {saving && !submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Drafts
            </Button>
            <Button
              onClick={handleSaveAndSubmit}
              disabled={!isValid || busy}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {saving && !submitting
                ? "Saving..."
                : submitting
                ? "Submitting..."
                : `Submit to Redmine (${dateStrings.length})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

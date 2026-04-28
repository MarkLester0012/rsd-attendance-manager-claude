"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { parseSlackEOD } from "@/lib/redmine/parser";
import { cn } from "@/lib/utils";
import type { ParsedSlackEntry } from "@/lib/types";

interface PasteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEntriesParsed: (entries: ParsedSlackEntry[]) => void;
}

export function PasteDialog({
  open,
  onOpenChange,
  onEntriesParsed,
}: PasteDialogProps) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParsedSlackEntry[]>([]);
  const [expandedIdxs, setExpandedIdxs] = useState<Set<number>>(new Set());

  function toggleExpand(idx: number) {
    setExpandedIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  function handleParse() {
    const parsed = parseSlackEOD(text);
    setPreview(parsed);
    setExpandedIdxs(new Set());
  }

  function handleConfirm() {
    onEntriesParsed(preview);
    handleClose(false);
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      setText("");
      setPreview([]);
      setExpandedIdxs(new Set());
    }
    onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Paste Slack EOD Message</DialogTitle>
          <DialogDescription>
            Paste your end-of-day ticket summary. Ticket IDs will be extracted
            automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            placeholder={`@here\n#78830 - 100%\n\nAssist with task\n\nOtsukaresamadesu`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview([]);
            }}
            rows={8}
            className="font-mono text-sm"
          />

          {preview.length === 0 && text.trim() && (
            <Button onClick={handleParse} className="w-full">
              Parse Message
            </Button>
          )}

          {preview.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                Found {preview.length} ticket{preview.length !== 1 ? "s" : ""}:
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {preview.map((entry, idx) => {
                  const isExpanded = expandedIdxs.has(idx);
                  const desc = entry.description || "No description";
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-3 rounded-lg border border-border/50 bg-muted/30 p-3"
                    >
                      <Badge variant="outline" className="shrink-0 font-mono">
                        #{entry.issueId}
                      </Badge>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p
                          className={cn(
                            "text-sm text-muted-foreground break-words cursor-pointer hover:text-foreground/70 transition-colors",
                            !isExpanded && "line-clamp-1"
                          )}
                          onClick={() => toggleExpand(idx)}
                          title={isExpanded ? "Click to collapse" : "Click to expand"}
                        >
                          {desc}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {entry.percentage}%
                      </Badge>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setPreview([])}
                >
                  Re-parse
                </Button>
                <Button onClick={handleConfirm}>
                  Add {preview.length} Entries
                </Button>
              </div>
            </div>
          )}

          {preview.length === 0 && text.trim() === "" && (
            <p className="text-xs text-muted-foreground text-center">
              Expected format: #12345 - 100% followed by description
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

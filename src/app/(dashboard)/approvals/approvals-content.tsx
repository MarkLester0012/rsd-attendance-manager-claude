"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Check, X, Loader2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import { getInitials, cn } from "@/lib/utils";
import type { User } from "@/lib/types";

interface ApprovalsContentProps {
  user: User;
  initialLeaves: any[];
}

export function ApprovalsContent({
  user,
  initialLeaves,
}: ApprovalsContentProps) {
  const [leaves, setLeaves] = useState(initialLeaves);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const pending = leaves.filter((l) => l.status === "pending");
  const approved = leaves.filter((l) => l.status === "approved");
  const rejected = leaves.filter((l) => l.status === "rejected");

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("leaves-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaves" },
        () => {
          fetchLeaves();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchLeaves() {
    const supabase = createClient();
    const { data } = await supabase
      .from("leaves")
      .select(
        "*, user:users!leaves_user_id_fkey(id, name, email, role, department_id)"
      )
      .order("created_at", { ascending: false });
    if (data) setLeaves(data);
  }

  async function handleAction(leaveId: string, status: "approved" | "rejected") {
    setLoadingId(leaveId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("leaves")
        .update({
          status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", leaveId);

      if (error) throw error;
      toast.success(`Leave ${status}`);

      setLeaves((prev) =>
        prev.map((l) =>
          l.id === leaveId
            ? {
                ...l,
                status,
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
              }
            : l
        )
      );
    } catch {
      toast.error("Failed to update leave");
    } finally {
      setLoadingId(null);
    }
  }

  function LeaveCard({
    leave,
    showActions,
  }: {
    leave: any;
    showActions: boolean;
  }) {
    const config = LEAVE_TYPES[leave.leave_type as keyof typeof LEAVE_TYPES];
    const isLoading = loadingId === leave.id;

    return (
      <Card className="transition-all hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Avatar */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
              {getInitials(leave.user?.name || "?")}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">
                  {leave.user?.name || "Unknown"}
                </span>
                <Badge
                  className="text-[10px]"
                  style={{
                    backgroundColor: config
                      ? `hsl(var(${config.cssVar}) / 0.15)`
                      : undefined,
                    color: config
                      ? `hsl(var(${config.cssVar}))`
                      : undefined,
                    borderColor: "transparent",
                  }}
                >
                  {config?.label || leave.leave_type}
                </Badge>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{format(new Date(leave.leave_date), "MMM d, yyyy")}</span>
                <span>
                  {leave.duration_value === 1 ? "Full day" : "Half day"}
                </span>
              </div>

              {leave.reason && (
                <p className="text-xs text-muted-foreground/80 line-clamp-2">
                  {leave.reason}
                </p>
              )}

              <p className="text-[10px] text-muted-foreground/50">
                Submitted {format(new Date(leave.created_at), "MMM d, yyyy")}
              </p>

              {/* Review info for approved/rejected */}
              {leave.reviewed_at && (
                <p className="text-[10px] text-muted-foreground/50">
                  {leave.status === "approved" ? "Approved" : "Rejected"} on{" "}
                  {format(new Date(leave.reviewed_at), "MMM d, yyyy")}
                </p>
              )}
            </div>

            {/* Actions */}
            {showActions && (
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                  onClick={() => handleAction(leave.id, "approved")}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                  onClick={() => handleAction(leave.id, "rejected")}
                  disabled={isLoading}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-emerald-500">Live</span>
        </div>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            Pending
            {pending.length > 0 && (
              <Badge
                variant="destructive"
                className="h-4 min-w-[16px] rounded-full px-1 text-[9px]"
              >
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({approved.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected ({rejected.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3 mt-4">
          {pending.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                No pending approvals
              </p>
            </div>
          ) : (
            pending.map((l) => (
              <LeaveCard key={l.id} leave={l} showActions />
            ))
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-3 mt-4">
          {approved.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No approved leaves
            </p>
          ) : (
            approved.map((l) => (
              <LeaveCard key={l.id} leave={l} showActions={false} />
            ))
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-3 mt-4">
          {rejected.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No rejected leaves
            </p>
          ) : (
            rejected.map((l) => (
              <LeaveCard key={l.id} leave={l} showActions={false} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

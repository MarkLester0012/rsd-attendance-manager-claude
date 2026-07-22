"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Bell,
  FileText,
  CheckCircle2,
  XCircle,
  CalendarX,
  FolderKanban,
  FolderMinus,
  MessageCircle,
  CornerDownRight,
  ThumbsUp,
  Megaphone,
  PartyPopper,
  Bus,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useNotifications } from "@/hooks/use-notifications";
import type { Notification, NotificationType, UserRole } from "@/lib/types";

interface UpcomingHoliday {
  id: string;
  name: string;
  observed_date: string;
}

interface NotificationPanelProps {
  userId: string;
  userRole: UserRole;
}

const ICON_MAP: Record<
  NotificationType,
  { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  leave_submitted: { icon: FileText, color: "text-amber-600 dark:text-amber-400" },
  leave_approved: { icon: CheckCircle2, color: "text-green-600 dark:text-green-400" },
  leave_rejected: { icon: XCircle, color: "text-red-600 dark:text-red-400" },
  leave_cancelled: { icon: CalendarX, color: "text-orange-600 dark:text-orange-400" },
  project_added: { icon: FolderKanban, color: "text-violet-600 dark:text-violet-400" },
  project_removed: { icon: FolderMinus, color: "text-muted-foreground" },
  suggestion_comment: { icon: MessageCircle, color: "text-blue-600 dark:text-blue-400" },
  suggestion_reply: { icon: CornerDownRight, color: "text-blue-600 dark:text-blue-400" },
  suggestion_upvote: { icon: ThumbsUp, color: "text-blue-600 dark:text-blue-400" },
  announcement_new: { icon: Megaphone, color: "text-yellow-600 dark:text-yellow-400" },
  allowance_change_request: { icon: Bus, color: "text-cyan-600 dark:text-cyan-400" },
  allowance_request_reviewed: { icon: Bus, color: "text-cyan-600 dark:text-cyan-400" },
  allowance_submitted: { icon: Bus, color: "text-cyan-600 dark:text-cyan-400" },
  allowance_submission_reviewed: { icon: Bus, color: "text-cyan-600 dark:text-cyan-400" },
};

const NOTIFICATION_ROUTES: Record<NotificationType, string> = {
  leave_submitted: "/approvals",
  leave_approved: "/my-leaves",
  leave_rejected: "/my-leaves",
  leave_cancelled: "/approvals",
  project_added: "/dashboard",
  project_removed: "/dashboard",
  suggestion_comment: "/suggestions",
  suggestion_reply: "/suggestions",
  suggestion_upvote: "/suggestions",
  announcement_new: "/dashboard",
  allowance_change_request: "/transportation-allowance?tab=requests",
  allowance_request_reviewed: "/transportation-allowance",
  allowance_submitted: "/transportation-allowance?tab=requests",
  allowance_submission_reviewed: "/transportation-allowance",
};

function timeAgo(iso: string) {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function NotificationPanel({ userId, userRole }: NotificationPanelProps) {
  const { notifications, unreadCount, markRead, markAllRead } =
    useNotifications(userId);
  const [open, setOpen] = useState(false);
  const [upcomingHolidays, setUpcomingHolidays] = useState<UpcomingHoliday[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const router = useRouter();

  useEffect(() => {
    if (!open) { setVisibleCount(10); return; }
    const supabase = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    supabase
      .from("holidays")
      .select("id, name, observed_date")
      .gte("observed_date", today.toISOString().split("T")[0])
      .lte("observed_date", in3Days.toISOString().split("T")[0])
      .order("observed_date")
      .then(({ data }) => setUpcomingHolidays((data as UpcomingHoliday[]) ?? []));
  }, [open]);

  function handleNotificationClick(n: Notification) {
    if (!n.read) markRead(n.id);
    setOpen(false);
    const isProjectType = n.type === "project_added" || n.type === "project_removed";
    const route = isProjectType
      ? (userRole === "leader" || userRole === "hr" ? "/projects" : "/dashboard")
      : NOTIFICATION_ROUTES[n.type];
    router.push(route);
  }

  const visibleNotifications = notifications.slice(0, visibleCount);
  const hasMore = notifications.length > visibleCount;
  const isEmpty = notifications.length === 0 && upcomingHolidays.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>

        <div className="overflow-y-auto max-h-[400px] scrollbar-thin">
          {/* Upcoming holidays (computed) */}
          {upcomingHolidays.map((h) => {
            const days = daysUntil(h.observed_date);
            return (
              <div
                key={h.id}
                className="flex items-start gap-3 px-4 py-3 border-b border-border/30 bg-yellow-500/5"
              >
                <PartyPopper className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{h.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {days === 0
                      ? "Today"
                      : days === 1
                      ? "Tomorrow"
                      : `In ${days} days`}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Stored notifications */}
          {notifications.length === 0 && upcomingHolidays.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          )}

          {visibleNotifications.map((n) => {
            const meta = ICON_MAP[n.type];
            const Icon = meta?.icon ?? Bell;
            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 border-b border-border/30 cursor-pointer transition-colors hover:bg-accent/30",
                  !n.read && "bg-primary/5 border-l-2 border-l-primary/50"
                )}
              >
                <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", meta?.color)} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
                {!n.read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={() => setVisibleCount((c) => c + 10)}
              className="w-full py-2.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              See previous notifications
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

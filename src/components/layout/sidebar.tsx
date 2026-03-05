"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSidebarStore } from "@/stores/sidebar-store";
import { useThemeStore } from "@/stores/theme-store";
import { getNavItemsForRole, type NavItem } from "@/lib/constants/navigation";
import { cn, getInitials } from "@/lib/utils";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  CheckSquare,
  UserCog,
  FolderKanban,
  PartyPopper,
  Megaphone,
  BarChart3,
  Lightbulb,
  UserCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  CheckSquare,
  UserCog,
  FolderKanban,
  PartyPopper,
  Megaphone,
  BarChart3,
  Lightbulb,
  UserCircle,
};

interface SidebarProps {
  user: User;
  pendingCount?: number;
}

function SidebarNavItem({
  item,
  isActive,
  isCollapsed,
  pendingCount,
}: {
  item: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  pendingCount?: number;
}) {
  const Icon = ICON_MAP[item.icon];
  const showBadge = item.badgeKey === "pendingApprovals" && pendingCount && pendingCount > 0;

  const content = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        isCollapsed && "justify-center px-2"
      )}
    >
      {Icon && <Icon className="h-5 w-5 shrink-0" />}
      {!isCollapsed && (
        <>
          <span className="flex-1">{item.label}</span>
          {showBadge && (
            <Badge
              variant="destructive"
              className="h-5 min-w-[20px] rounded-full px-1.5 text-[10px] font-bold"
            >
              {pendingCount}
            </Badge>
          )}
        </>
      )}
    </Link>
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="flex items-center gap-2">
          {item.label}
          {showBadge && (
            <Badge
              variant="destructive"
              className="h-4 min-w-[16px] rounded-full px-1 text-[9px]"
            >
              {pendingCount}
            </Badge>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function SidebarContent({ user, pendingCount }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, toggle } = useSidebarStore();
  const { theme, toggleTheme } = useThemeStore();

  const navItems = getNavItemsForRole(user.role);
  const mainItems = navItems.filter((i) => i.section === "main");
  const managementItems = navItems.filter((i) => i.section === "management");
  const generalItems = navItems.filter((i) => i.section === "general");

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo area */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-sidebar-border">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-bold">
          R
        </div>
        {!isCollapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">
              Ring Systems Dev
            </span>
            <span className="truncate text-[11px] text-sidebar-foreground/50">
              Attendance Manager
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground"
          onClick={toggle}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <TooltipProvider>
        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-6">
          {/* Main */}
          <div className="space-y-1">
            {!isCollapsed && (
              <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                Main
              </p>
            )}
            {mainItems.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                isCollapsed={isCollapsed}
                pendingCount={pendingCount}
              />
            ))}
          </div>

          {/* Management */}
          {managementItems.length > 0 && (
            <div className="space-y-1">
              {!isCollapsed && (
                <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  Management
                </p>
              )}
              {managementItems.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  item={item}
                  isActive={pathname === item.href}
                  isCollapsed={isCollapsed}
                  pendingCount={pendingCount}
                />
              ))}
            </div>
          )}

          {/* General */}
          <div className="space-y-1">
            {!isCollapsed && (
              <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                General
              </p>
            )}
            {generalItems.map((item) => (
              <SidebarNavItem
                key={item.href}
                item={item}
                isActive={pathname === item.href}
                isCollapsed={isCollapsed}
                pendingCount={pendingCount}
              />
            ))}
          </div>
        </nav>
      </TooltipProvider>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3 space-y-3">
        {/* Theme toggle */}
        <Button
          variant="ghost"
          size={isCollapsed ? "icon" : "default"}
          className={cn(
            "text-sidebar-foreground/60 hover:text-sidebar-foreground",
            !isCollapsed && "w-full justify-start gap-3"
          )}
          onClick={toggleTheme}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {!isCollapsed && (
            <span className="text-sm">
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
          )}
        </Button>

        <Separator className="bg-sidebar-border" />

        {/* User info */}
        <div
          className={cn(
            "flex items-center gap-3",
            isCollapsed && "justify-center"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-[11px] font-bold text-white">
            {getInitials(user.name)}
          </div>
          {!isCollapsed && (
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user.name}
              </p>
              <p className="truncate text-[11px] text-sidebar-foreground/50 capitalize">
                {user.role}
              </p>
            </div>
          )}
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 shrink-0 text-sidebar-foreground/50 hover:text-red-400",
                    isCollapsed && "mt-2"
                  )}
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign out</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ user, pendingCount }: SidebarProps) {
  const { isCollapsed, isMobileOpen, setMobileOpen } = useSidebarStore();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex h-screen sticky top-0 transition-all duration-300 ease-in-out",
          isCollapsed ? "w-[72px]" : "w-64"
        )}
      >
        <SidebarContent user={user} pendingCount={pendingCount} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent user={user} pendingCount={pendingCount} />
        </SheetContent>
      </Sheet>
    </>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { useSidebarStore } from "@/stores/sidebar-store";
import { Button } from "@/components/ui/button";
import { Menu, Bell } from "lucide-react";
import { format } from "date-fns";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/calendar": "My Calendar",
  "/attendance": "Office Attendance",
  "/my-leaves": "My Leaves",
  "/approvals": "Approvals",
  "/team": "Team Members",
  "/projects": "Projects",
  "/holidays": "Holidays",
  "/announcements": "Announcements",
  "/reports": "Reports",
  "/suggestions": "Suggestions",
  "/profile": "Profile",
};

export function Header() {
  const pathname = usePathname();
  const { setMobileOpen } = useSidebarStore();

  const title = PAGE_TITLES[pathname] || "Dashboard";
  const today = format(new Date(), "EEEE, MMMM d, yyyy");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-md px-4 md:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Page title */}
      <div className="flex-1">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground hidden sm:block">{today}</p>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {/* Visual only notification dot */}
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500" />
        </Button>
      </div>
    </header>
  );
}

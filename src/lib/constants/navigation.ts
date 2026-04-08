import type { UserRole } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: UserRole[];
  section: "main" | "management" | "general";
  badgeKey?: string;
  department?: string;
}

export const NAV_ITEMS: NavItem[] = [
  // Main
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "LayoutDashboard",
    roles: ["member", "leader", "hr"],
    section: "main",
  },
  {
    label: "My Calendar",
    href: "/calendar",
    icon: "Calendar",
    roles: ["member", "leader", "hr"],
    section: "main",
  },
  {
    label: "Office Attendance",
    href: "/attendance",
    icon: "Users",
    roles: ["member", "leader", "hr"],
    section: "main",
  },
  {
    label: "My Leaves",
    href: "/my-leaves",
    icon: "FileText",
    roles: ["member", "leader", "hr"],
    section: "main",
  },
  {
    label: "Time Logger",
    href: "/time-logger",
    icon: "Timer",
    roles: ["member", "leader", "hr"],
    section: "main",
  },
  // Management
  {
    label: "Approvals",
    href: "/approvals",
    icon: "CheckSquare",
    roles: ["leader", "hr"],
    section: "management",
    badgeKey: "pendingApprovals",
  },
  {
    label: "Team Members",
    href: "/team",
    icon: "UserCog",
    roles: ["leader", "hr"],
    section: "management",
  },
  {
    label: "Projects",
    href: "/projects",
    icon: "FolderKanban",
    roles: ["leader"],
    section: "management",
  },
  {
    label: "Holidays",
    href: "/holidays",
    icon: "PartyPopper",
    roles: ["hr"],
    section: "management",
  },
  {
    label: "Announcements",
    href: "/announcements",
    icon: "Megaphone",
    roles: ["hr"],
    section: "management",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: "BarChart3",
    roles: ["hr"],
    section: "management",
  },
  // General
  {
    label: "Suggestions",
    href: "/suggestions",
    icon: "Lightbulb",
    roles: ["member", "leader", "hr"],
    section: "general",
  },
  {
    label: "Profile",
    href: "/profile",
    icon: "UserCircle",
    roles: ["member", "leader", "hr"],
    section: "general",
  },
];

export function getNavItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

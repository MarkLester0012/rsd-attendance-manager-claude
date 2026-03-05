"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import type { User } from "@/lib/types";

interface DashboardShellProps {
  children: React.ReactNode;
  user: User;
  pendingCount: number;
}

export function DashboardShell({
  children,
  user,
  pendingCount,
}: DashboardShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} pendingCount={pendingCount} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

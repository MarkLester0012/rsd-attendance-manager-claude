import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function redmineIssueUrl(baseUrl: string | null | undefined, issueId: number): string | null {
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}/issues/${issueId}` : null;
}

export function formatDate(date: Date | string): string {
  // parseISO treats date-only strings ("2026-07-05") as local midnight;
  // new Date() would parse them as UTC and shift the day in negative-offset
  // timezones.
  const d = typeof date === "string" ? parseISO(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

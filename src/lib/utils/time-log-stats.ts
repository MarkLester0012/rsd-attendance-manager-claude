import { parseISO, isSameMonth, startOfWeek, endOfWeek, format } from "date-fns";

/**
 * Minimal shape needed for stats — kept local (rather than imported from
 * month-view.tsx) to avoid a circular import. MonthViewEntry is structurally
 * compatible, so it can be passed directly without casting.
 */
export interface TimeLogStatEntry {
  log_date: string;
  issue_id: number | undefined;
  hours: number;
  project_name?: string;
}

export interface ProjectHours {
  name: string;
  hours: number;
  color: string | null;
}

export interface TicketHours {
  issueId: number;
  projectName?: string;
  hours: number;
  color: string | null;
}

export interface DayHours {
  date: string;
  hours: number;
}

export interface WeekHours {
  weekStart: string;
  weekEnd: string;
  hours: number;
}

export interface TimeLogTotals {
  totalHours: number;
  daysLogged: number;
  avgHoursPerLoggedDay: number;
}

export function formatHours(h: number): string {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

// Maps a project name to its color using the same heuristic as the calendar
// cell chips: first 4 chars of project_name, uppercased, looked up by redmine_code.
function projectColor(
  projectName: string | undefined,
  projectColorMap: Record<string, string>
): string | null {
  if (!projectName) return null;
  const code = projectName.slice(0, 4).toUpperCase();
  return projectColorMap[code] ?? null;
}

export function filterToMonth(
  entries: TimeLogStatEntry[],
  month: Date
): TimeLogStatEntry[] {
  return entries.filter((e) => isSameMonth(parseISO(e.log_date), month));
}

export function hoursByProject(
  entries: TimeLogStatEntry[],
  projectColorMap: Record<string, string> = {}
): ProjectHours[] {
  const map = new Map<string, { hours: number; projectName?: string }>();
  for (const e of entries) {
    const name = e.project_name ?? "No project";
    const existing = map.get(name);
    if (existing) {
      existing.hours += e.hours;
    } else {
      map.set(name, { hours: e.hours, projectName: e.project_name });
    }
  }
  return Array.from(map.entries())
    .map(([name, { hours, projectName }]) => ({
      name,
      hours,
      color: projectColor(projectName, projectColorMap),
    }))
    .sort((a, b) => b.hours - a.hours);
}

export function hoursByTicket(
  entries: TimeLogStatEntry[],
  projectColorMap: Record<string, string> = {}
): TicketHours[] {
  const map = new Map<number, { hours: number; projectName?: string }>();
  for (const e of entries) {
    if (!e.issue_id) continue;
    const existing = map.get(e.issue_id);
    if (existing) {
      existing.hours += e.hours;
      if (!existing.projectName && e.project_name) existing.projectName = e.project_name;
    } else {
      map.set(e.issue_id, { hours: e.hours, projectName: e.project_name });
    }
  }
  return Array.from(map.entries())
    .map(([issueId, { hours, projectName }]) => ({
      issueId,
      projectName,
      hours,
      color: projectColor(projectName, projectColorMap),
    }))
    .sort((a, b) => b.hours - a.hours || a.issueId - b.issueId);
}

export function busiestDay(entries: TimeLogStatEntry[]): DayHours | null {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.log_date, (map.get(e.log_date) ?? 0) + e.hours);
  }
  let best: DayHours | null = null;
  for (const [date, hours] of map.entries()) {
    if (!best || hours > best.hours || (hours === best.hours && date < best.date)) {
      best = { date, hours };
    }
  }
  return best;
}

export function busiestWeek(entries: TimeLogStatEntry[]): WeekHours | null {
  const map = new Map<string, number>();
  for (const e of entries) {
    const weekStartKey = format(startOfWeek(parseISO(e.log_date)), "yyyy-MM-dd");
    map.set(weekStartKey, (map.get(weekStartKey) ?? 0) + e.hours);
  }
  let bestKey: string | null = null;
  let bestHours = 0;
  for (const [key, hours] of map.entries()) {
    if (bestKey === null || hours > bestHours || (hours === bestHours && key < bestKey)) {
      bestKey = key;
      bestHours = hours;
    }
  }
  if (bestKey === null) return null;
  return {
    weekStart: bestKey,
    weekEnd: format(endOfWeek(parseISO(bestKey)), "yyyy-MM-dd"),
    hours: bestHours,
  };
}

export function timeLogTotals(entries: TimeLogStatEntry[]): TimeLogTotals {
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const daysLogged = new Set(entries.map((e) => e.log_date)).size;
  const avgHoursPerLoggedDay = daysLogged > 0 ? totalHours / daysLogged : 0;
  return { totalHours, daysLogged, avgHoursPerLoggedDay };
}

import { describe, it, expect } from "vitest";
import {
  hoursByProject,
  hoursByTicket,
  filterToMonth,
  busiestDay,
  busiestWeek,
  timeLogTotals,
  type TimeLogStatEntry,
} from "./time-log-stats";

const entry = (
  log_date: string,
  hours: number,
  issue_id: number | undefined = undefined,
  project_name: string | undefined = undefined
): TimeLogStatEntry => ({ log_date, hours, issue_id, project_name });

const PROJECT_COLORS: Record<string, string> = {
  ALPH: "#ff0000",
  BETA: "#00ff00",
};

describe("hoursByProject", () => {
  it("groups and sums hours per project, sorted descending", () => {
    const entries = [
      entry("2026-06-01", 2, 1, "Alpha"),
      entry("2026-06-02", 3, 2, "Alpha"),
      entry("2026-06-03", 1, 3, "Beta"),
    ];
    const result = hoursByProject(entries, PROJECT_COLORS);
    expect(result).toEqual([
      { name: "Alpha", hours: 5, color: "#ff0000" },
      { name: "Beta", hours: 1, color: "#00ff00" },
    ]);
  });

  it("groups entries without project_name under 'No project'", () => {
    const entries = [entry("2026-06-01", 2), entry("2026-06-02", 1)];
    const result = hoursByProject(entries, PROJECT_COLORS);
    expect(result).toEqual([{ name: "No project", hours: 3, color: null }]);
  });

  it("returns null color when project name has no match in the color map", () => {
    const entries = [entry("2026-06-01", 2, 1, "Gamma")];
    const result = hoursByProject(entries, PROJECT_COLORS);
    expect(result).toEqual([{ name: "Gamma", hours: 2, color: null }]);
  });
});

describe("hoursByTicket", () => {
  it("groups and sums hours per ticket, sorted descending", () => {
    const entries = [
      entry("2026-06-01", 1, 10, "Alpha"),
      entry("2026-06-02", 4, 20, "Beta"),
      entry("2026-06-03", 2, 10, "Alpha"),
    ];
    const result = hoursByTicket(entries, PROJECT_COLORS);
    expect(result).toEqual([
      { issueId: 20, projectName: "Beta", hours: 4, color: "#00ff00" },
      { issueId: 10, projectName: "Alpha", hours: 3, color: "#ff0000" },
    ]);
  });

  it("breaks ties in hours by ascending issue id", () => {
    const entries = [
      entry("2026-06-01", 2, 20, "Beta"),
      entry("2026-06-02", 2, 10, "Alpha"),
    ];
    const result = hoursByTicket(entries, PROJECT_COLORS);
    expect(result.map((r) => r.issueId)).toEqual([10, 20]);
  });

  it("excludes entries without an issue_id", () => {
    const entries = [entry("2026-06-01", 2, undefined, "Alpha"), entry("2026-06-02", 1, 10, "Alpha")];
    const result = hoursByTicket(entries, PROJECT_COLORS);
    expect(result).toEqual([{ issueId: 10, projectName: "Alpha", hours: 1, color: "#ff0000" }]);
  });
});

describe("filterToMonth", () => {
  it("excludes entries from an adjacent month", () => {
    const entries = [
      entry("2026-05-31", 2), // last day of previous month (grid spillover)
      entry("2026-06-01", 3),
    ];
    const result = filterToMonth(entries, new Date(2026, 5, 1));
    expect(result).toEqual([entry("2026-06-01", 3)]);
  });

  it("includes entries within the month", () => {
    const entries = [entry("2026-06-15", 4)];
    const result = filterToMonth(entries, new Date(2026, 5, 1));
    expect(result).toHaveLength(1);
  });
});

describe("busiestDay", () => {
  it("picks the date with the highest summed hours", () => {
    const entries = [
      entry("2026-06-01", 2),
      entry("2026-06-01", 3),
      entry("2026-06-02", 4),
    ];
    expect(busiestDay(entries)).toEqual({ date: "2026-06-01", hours: 5 });
  });

  it("returns null for an empty list", () => {
    expect(busiestDay([])).toBeNull();
  });
});

describe("busiestWeek", () => {
  it("picks the week with the highest summed hours", () => {
    // Sun Jun 7 – Sat Jun 13, 2026 vs Sun Jun 14 – Sat Jun 20, 2026
    const entries = [
      entry("2026-06-08", 5),
      entry("2026-06-09", 5),
      entry("2026-06-15", 3),
    ];
    const result = busiestWeek(entries);
    expect(result?.hours).toBe(10);
    expect(result?.weekStart).toBe("2026-06-07");
    expect(result?.weekEnd).toBe("2026-06-13");
  });

  it("returns null for an empty list", () => {
    expect(busiestWeek([])).toBeNull();
  });
});

describe("timeLogTotals", () => {
  it("sums total hours, counts distinct logged days, and averages per logged day", () => {
    const entries = [
      entry("2026-06-01", 4),
      entry("2026-06-01", 4),
      entry("2026-06-02", 2),
    ];
    expect(timeLogTotals(entries)).toEqual({
      totalHours: 10,
      daysLogged: 2,
      avgHoursPerLoggedDay: 5,
    });
  });

  it("returns zero average for an empty list", () => {
    expect(timeLogTotals([])).toEqual({
      totalHours: 0,
      daysLogged: 0,
      avgHoursPerLoggedDay: 0,
    });
  });
});

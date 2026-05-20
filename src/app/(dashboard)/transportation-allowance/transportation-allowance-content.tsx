"use client";

import { HRView } from "./hr-view";
import { EmployeeView } from "./employee-view";
import type { AllowanceSnapshot, AllowanceSubmissionRequest, DistanceChangeRequest, User, TransportMode } from "@/lib/types";
import type { EmployeeDefaults, EmployeeStats } from "./page";

interface Props {
  user: User;
  defaultMonth: string;
  employees: User[];
  initialSnapshots: AllowanceSnapshot[];
  initialChangeRequests: DistanceChangeRequest[];
  initialSubmissionRequests: AllowanceSubmissionRequest[];
  employeeDefaults: EmployeeDefaults;
  employeeStatsList: Record<string, EmployeeStats>;
  initialTab?: string;
  // Employee-only
  employeeStats?: EmployeeStats;
  previousMonthMode?: TransportMode | null;
}

export function TransportationAllowanceContent({
  user,
  defaultMonth,
  employees,
  initialSnapshots,
  initialChangeRequests,
  initialSubmissionRequests,
  employeeDefaults,
  employeeStatsList,
  initialTab,
  employeeStats,
  previousMonthMode,
}: Props) {
  if (user.role === "hr") {
    return (
      <HRView
        user={user}
        employees={employees}
        initialSnapshots={initialSnapshots}
        initialChangeRequests={initialChangeRequests}
        initialSubmissionRequests={initialSubmissionRequests}
        defaultMonth={defaultMonth}
        employeeDefaults={employeeDefaults}
        employeeStatsList={employeeStatsList}
        initialTab={initialTab}
      />
    );
  }

  return (
    <EmployeeView
      user={user}
      snapshots={initialSnapshots}
      changeRequests={initialChangeRequests}
      submissionRequests={initialSubmissionRequests}
      defaultMonth={defaultMonth}
      employeeStats={employeeStats ?? { business_days: 22, holiday_count: 0, leave_breakdown: {}, wfh_days: 0, days_worked: 22 }}
      previousMonthMode={previousMonthMode ?? null}
    />
  );
}

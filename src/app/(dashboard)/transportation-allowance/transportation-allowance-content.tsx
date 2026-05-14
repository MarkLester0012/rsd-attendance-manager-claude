"use client";

import { HRView } from "./hr-view";
import { EmployeeView } from "./employee-view";
import type { AllowanceSnapshot, DistanceChangeRequest, User } from "@/lib/types";
import type { EmployeeDefaults } from "./page";

interface Props {
  user: User;
  defaultMonth: string;
  employees: User[];
  initialSnapshots: AllowanceSnapshot[];
  initialChangeRequests: DistanceChangeRequest[];
  employeeDefaults: EmployeeDefaults;
  initialTab?: string;
}

export function TransportationAllowanceContent({
  user,
  defaultMonth,
  employees,
  initialSnapshots,
  initialChangeRequests,
  employeeDefaults,
  initialTab,
}: Props) {
  if (user.role === "hr") {
    return (
      <HRView
        user={user}
        employees={employees}
        initialSnapshots={initialSnapshots}
        initialChangeRequests={initialChangeRequests}
        defaultMonth={defaultMonth}
        employeeDefaults={employeeDefaults}
        initialTab={initialTab}
      />
    );
  }

  return (
    <EmployeeView
      user={user}
      snapshots={initialSnapshots}
      changeRequests={initialChangeRequests}
      defaultMonth={defaultMonth}
    />
  );
}

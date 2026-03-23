import type { LeaveTypeCode } from "@/lib/types";

export interface LeaveTypeConfig {
  code: LeaveTypeCode;
  label: string;
  requiresApproval: boolean;
  deductsBalance: boolean;
  allowHalfDay: boolean;
  requiresReason: boolean;
  colorClass: string;
  cssVar: string;
}

export const LEAVE_TYPES: Record<LeaveTypeCode, LeaveTypeConfig> = {
  VL: {
    code: "VL",
    label: "Vacation Leave",
    requiresApproval: true,
    deductsBalance: true,
    allowHalfDay: true,
    requiresReason: true,
    colorClass: "leave-vl",
    cssVar: "--leave-vl",
  },
  PL: {
    code: "PL",
    label: "Paternity Leave",
    requiresApproval: true,
    deductsBalance: true,
    allowHalfDay: false,
    requiresReason: true,
    colorClass: "leave-pl",
    cssVar: "--leave-pl",
  },
  ML: {
    code: "ML",
    label: "Maternity Leave",
    requiresApproval: true,
    deductsBalance: true,
    allowHalfDay: false,
    requiresReason: true,
    colorClass: "leave-ml",
    cssVar: "--leave-ml",
  },
  SPL: {
    code: "SPL",
    label: "Special Leave",
    requiresApproval: true,
    deductsBalance: true,
    allowHalfDay: false,
    requiresReason: true,
    colorClass: "leave-spl",
    cssVar: "--leave-spl",
  },
  SL: {
    code: "SL",
    label: "Sick Leave",
    requiresApproval: false,
    deductsBalance: true,
    allowHalfDay: true,
    requiresReason: false,
    colorClass: "leave-sl",
    cssVar: "--leave-sl",
  },
  NW: {
    code: "NW",
    label: "No Work",
    requiresApproval: false,
    deductsBalance: false,
    allowHalfDay: false,
    requiresReason: false,
    colorClass: "leave-nw",
    cssVar: "--leave-nw",
  },
  RGA: {
    code: "RGA",
    label: "RGA Office",
    requiresApproval: false,
    deductsBalance: false,
    allowHalfDay: false,
    requiresReason: false,
    colorClass: "leave-rga",
    cssVar: "--leave-rga",
  },
  AB: {
    code: "AB",
    label: "Absent",
    requiresApproval: false,
    deductsBalance: true,
    allowHalfDay: false,
    requiresReason: false,
    colorClass: "leave-ab",
    cssVar: "--leave-ab",
  },
  WFH: {
    code: "WFH",
    label: "Work From Home",
    requiresApproval: false,
    deductsBalance: false,
    allowHalfDay: true,
    requiresReason: false,
    colorClass: "leave-wfh",
    cssVar: "--leave-wfh",
  },
};

export const LEAVE_TYPE_LIST = Object.values(LEAVE_TYPES);

export const WFH_MONTHLY_CAP = 8.0;
export const WFH_DAILY_GLOBAL_CAP = 12;

export const APPROVAL_REQUIRED_TYPES: LeaveTypeCode[] = [
  "VL",
  "PL",
  "ML",
  "SPL",
];
export const AUTO_APPROVED_TYPES: LeaveTypeCode[] = [
  "SL",
  "NW",
  "RGA",
  "AB",
  "WFH",
];
export const NON_DEDUCTIBLE_TYPES: LeaveTypeCode[] = Object.values(LEAVE_TYPES)
  .filter((t) => !t.deductsBalance)
  .map((t) => t.code);
export const HALF_DAY_TYPES: LeaveTypeCode[] = ["SL", "VL", "WFH"];

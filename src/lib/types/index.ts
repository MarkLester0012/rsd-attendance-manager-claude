export type UserRole = "member" | "leader" | "hr";

export type LeaveTypeCode =
  | "VL"
  | "PL"
  | "ML"
  | "SPL"
  | "SL"
  | "NW"
  | "RGA"
  | "AB"
  | "WFH";

export type LeaveStatus = "pending" | "approved" | "rejected";

export type LeaveDuration = "whole" | "half_am" | "half_pm";

export interface User {
  id: string;
  auth_id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  department_id: string;
  leave_balance: number;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface Department {
  id: string;
  name: string;
  created_at: string;
}

export interface LeaveEntry {
  id: string;
  user_id: string;
  leave_type: LeaveTypeCode;
  leave_date: string;
  duration: LeaveDuration;
  duration_value: number;
  reason: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  user?: User;
  reviewer?: User;
}

export interface Holiday {
  id: string;
  name: string;
  observed_date: string;
  original_date: string | null;
  is_local: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  created_at: string;
  user?: User;
  project?: Project;
}

export interface Suggestion {
  id: string;
  user_id: string;
  content: string;
  is_anonymous: boolean;
  created_at: string;
  user?: User;
  upvote_count?: number;
  has_upvoted?: boolean;
}

export interface SuggestionUpvote {
  id: string;
  suggestion_id: string;
  user_id: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author_id: string;
  created_at: string;
  updated_at: string;
  author?: User;
}

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: UserRole[];
  badge?: number;
  section: "main" | "management" | "general";
  department?: string;
}

// Redmine Time Logger types
export type TimeLogStatus = "draft" | "submitted" | "failed";

export interface RedmineConfig {
  id: string;
  user_id: string;
  redmine_url: string;
  encrypted_api_key: string;
  encryption_iv: string;
  encryption_tag: string;
  default_activity_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface TimeLogEntry {
  id: string;
  user_id: string;
  log_date: string;
  issue_id: number;
  project_name: string | null;
  hours: number;
  activity_id: number;
  activity_name: string | null;
  comment: string | null;
  status: TimeLogStatus;
  redmine_time_entry_id: number | null;
  error_message: string | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface RedmineProjectField {
  id: string;
  user_id: string;
  redmine_project_id: number;
  redmine_project_name: string;
  field_id: number;
  field_name: string;
  field_type: string;
  possible_values: unknown[] | null;
  is_required: boolean;
  created_at: string;
}

export interface RedmineActivity {
  id: number;
  name: string;
  is_default?: boolean;
}

export interface RedmineIssueDetails {
  id: number;
  subject: string;
  project: { id: number; name: string };
}

export interface ParsedSlackEntry {
  issueId: number;
  percentage: number;
  description: string;
}

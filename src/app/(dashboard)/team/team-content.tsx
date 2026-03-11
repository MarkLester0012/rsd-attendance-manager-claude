"use client";

import { useState } from "react";
import { Search, Plus, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { registerUser, deleteUser } from "./actions";
import { LEAVE_TYPES } from "@/lib/constants/leave-types";
import { getInitials, cn } from "@/lib/utils";
import type { User, LeaveEntry, Department } from "@/lib/types";

interface TeamContentProps {
  currentUser: User;
  users: (User & { department?: Department })[];
  departments: Department[];
  todayLeaves: LeaveEntry[];
  projects: any[];
}

export function TeamContent({
  currentUser,
  users,
  departments,
  todayLeaves,
  projects,
}: TeamContentProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Edit form state
  const [formName, setFormName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("member");
  const [formDept, setFormDept] = useState("");
  const [formBalance, setFormBalance] = useState("15");

  const isHR = currentUser.role === "hr";

  function getUserStatus(userId: string) {
    const leave = todayLeaves.find((l) => l.user_id === userId);
    if (!leave) return { label: "In Office", type: null };
    const config = LEAVE_TYPES[leave.leave_type as keyof typeof LEAVE_TYPES];
    return { label: config?.label || leave.leave_type, type: leave.leave_type, cssVar: config?.cssVar };
  }

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.department?.name || "").toLowerCase().includes(search.toLowerCase());

    const status = getUserStatus(u.id);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "in-office" && !status.type) ||
      (statusFilter === "wfh" && status.type === "WFH") ||
      (statusFilter === "on-leave" && status.type && status.type !== "WFH");

    const matchesProject =
      projectFilter === "all" ||
      projects
        .find((p: any) => p.id === projectFilter)
        ?.project_members?.some((pm: any) => pm.user_id === u.id);

    return matchesSearch && matchesStatus && matchesProject;
  });

  function openView(u: any) {
    setSelectedUser(u);
    setIsViewOpen(true);
  }

  function openEdit(u: any) {
    setFormName(u.name);
    setFormUsername(u.username || "");
    setFormRole(u.role);
    setFormDept(u.department_id || "");
    setFormBalance(String(u.leave_balance));
    setEditUser(u);
    setIsCreating(false);
    setIsEditOpen(true);
  }

  function openCreate() {
    setFormName("");
    setFormUsername("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("member");
    setFormDept(departments[0]?.id || "");
    setFormBalance("15");
    setEditUser(null);
    setIsCreating(true);
    setIsEditOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }
    setIsSubmitting(true);
    const supabase = createClient();

    try {
      if (isCreating) {
        if (!formEmail.trim() || !formPassword.trim()) {
          toast.error("Email and password are required");
          setIsSubmitting(false);
          return;
        }
        if (formPassword.length < 6) {
          toast.error("Password must be at least 6 characters");
          setIsSubmitting(false);
          return;
        }

        const result = await registerUser({
          name: formName,
          username: formUsername,
          email: formEmail,
          password: formPassword,
          role: formRole,
          department_id: formDept || null,
          leave_balance: parseFloat(formBalance),
        });

        if (result.error) throw new Error(result.error);
        toast.success("Member registered successfully");
      } else {
        const { error } = await supabase
          .from("users")
          .update({
            name: formName,
            username: formUsername,
            role: formRole,
            department_id: formDept || null,
            leave_balance: parseFloat(formBalance),
          })
          .eq("id", editUser.id);

        if (error) throw error;
        toast.success("Member updated");
      }
      setIsEditOpen(false);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await deleteUser(deleteTarget.id);
      if (result.error) throw new Error(result.error);
      toast.success(`${deleteTarget.name} has been deleted`);
      setDeleteTarget(null);
      setIsViewOpen(false);
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in-office">In Office</SelectItem>
            <SelectItem value="wfh">WFH</SelectItem>
            <SelectItem value="on-leave">On Leave</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isHR && (
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Register Member
          </Button>
        )}
      </div>

      {/* User Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((u) => {
          const status = getUserStatus(u.id);
          return (
            <Card
              key={u.id}
              className="group cursor-pointer transition-all hover:shadow-md hover:border-border/80"
              onClick={() => openView(u)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                    {getInitials(u.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.department?.name || "No Dept"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {u.role}
                      </Badge>
                      <Badge
                        className="text-[10px]"
                        style={
                          status.type
                            ? {
                                backgroundColor: `hsl(var(${status.cssVar}) / 0.15)`,
                                color: `hsl(var(${status.cssVar}))`,
                                borderColor: "transparent",
                              }
                            : {
                                backgroundColor: "hsl(var(--status-approved) / 0.15)",
                                color: "hsl(var(--status-approved))",
                                borderColor: "transparent",
                              }
                        }
                      >
                        {status.label}
                      </Badge>
                    </div>
                  </div>
                  {isHR && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(u);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* View Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Team Member</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
                  {getInitials(selectedUser.name)}
                </div>
                <div>
                  <p className="text-lg font-semibold">{selectedUser.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Role</p>
                  <p className="font-medium capitalize">{selectedUser.role}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Department</p>
                  <p className="font-medium">{selectedUser.department?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Leave Balance</p>
                  <p className="font-medium">{selectedUser.leave_balance} days</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Projects</p>
                  <p className="font-medium">
                    {projects
                      .filter((p: any) =>
                        p.project_members?.some(
                          (pm: any) => pm.user_id === selectedUser.id
                        )
                      )
                      .map((p: any) => p.name)
                      .join(", ") || "—"}
                  </p>
                </div>
              </div>
              {isHR && selectedUser.id !== currentUser.id && (
                <div className="border-t pt-4">
                  <Button
                    variant="destructive"
                    className="w-full gap-2"
                    onClick={() => {
                      setIsViewOpen(false);
                      setDeleteTarget({ id: selectedUser.id, name: selectedUser.name });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Member
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Member
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                  {getInitials(deleteTarget.name)}
                </div>
                <div>
                  <p className="text-sm font-semibold">{deleteTarget.name}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                This will permanently delete this member&apos;s account and all
                associated data including:
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Leave requests and history</li>
                <li>Project memberships</li>
                <li>Suggestions and upvotes</li>
                <li>Announcements they authored</li>
              </ul>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Create Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isCreating ? "Register Member" : "Edit Member"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={formUsername} onChange={(e) => setFormUsername(e.target.value)} />
            </div>
            {isCreating && (
              <>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="leader">Leader</SelectItem>
                  <SelectItem value="hr">HR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={formDept} onValueChange={setFormDept}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Leave Balance</Label>
              <Input
                type="number"
                value={formBalance}
                onChange={(e) => setFormBalance(e.target.value)}
                min="0"
                step="0.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {isCreating ? "Register" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

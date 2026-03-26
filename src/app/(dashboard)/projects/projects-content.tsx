"use client";

import { useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  Loader2,
  Pencil,
  Search,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import type { User } from "@/lib/types";

interface ProjectsContentProps {
  currentUser: User;
  initialProjects: any[];
  leaders: { id: string; name: string; role: string }[];
  members: { id: string; name: string; role: string }[];
}

export function ProjectsContent({
  currentUser,
  initialProjects,
  leaders,
  members,
}: ProjectsContentProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showMyProjects, setShowMyProjects] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formLeaders, setFormLeaders] = useState<string[]>([currentUser.id]);
  const [memberSearch, setMemberSearch] = useState<Record<string, string>>({});

  const filteredProjects = useMemo(() => {
    if (!showMyProjects) return projects;
    return projects.filter((p: any) =>
      p.project_members?.some((pm: any) => pm.user_id === currentUser.id)
    );
  }, [projects, showMyProjects, currentUser.id]);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleCreate() {
    if (!formName.trim()) {
      toast.error("Project name is required");
      return;
    }
    if (formLeaders.length === 0) {
      toast.error("At least one leader is required");
      return;
    }
    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const { data: project, error } = await supabase
        .from("projects")
        .insert({ name: formName, description: formDesc || null })
        .select()
        .single();

      if (error) throw error;

      // Add leaders as members
      const memberInserts = formLeaders.map((uid) => ({
        project_id: project.id,
        user_id: uid,
      }));

      await supabase.from("project_members").insert(memberInserts);
      toast.success("Project created");
      setIsCreateOpen(false);
      await fetchProjects();
    } catch {
      toast.error("Failed to create project");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openEdit(project: any) {
    setEditingProject(project);
    setFormName(project.name);
    setFormDesc(project.description || "");
    setIsEditOpen(true);
  }

  async function handleEdit() {
    if (!formName.trim()) {
      toast.error("Project name is required");
      return;
    }
    setIsSubmitting(true);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("projects")
        .update({ name: formName, description: formDesc || null })
        .eq("id", editingProject.id);
      if (error) throw error;
      toast.success("Project updated");
      setIsEditOpen(false);
      await fetchProjects();
    } catch {
      toast.error("Failed to update project");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(projectId: string) {
    if (!window.confirm("Delete this project?")) return;
    const supabase = createClient();

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (error) {
      toast.error("Failed to delete project");
      return;
    }
    toast.success("Project deleted");
    setProjects((prev: any[]) => prev.filter((p) => p.id !== projectId));
  }

  async function toggleMember(projectId: string, userId: string, isAssigned: boolean) {
    const supabase = createClient();

    // Check leader constraint
    const project = projects.find((p: any) => p.id === projectId);
    if (isAssigned) {
      const assignedLeaders = project?.project_members?.filter(
        (pm: any) => pm.user?.role === "leader"
      );
      if (
        assignedLeaders?.length === 1 &&
        assignedLeaders[0].user_id === userId
      ) {
        toast.error("Project must have at least one leader");
        return;
      }
    }

    try {
      if (isAssigned) {
        await supabase
          .from("project_members")
          .delete()
          .eq("project_id", projectId)
          .eq("user_id", userId);
      } else {
        await supabase
          .from("project_members")
          .insert({ project_id: projectId, user_id: userId });
      }
      await fetchProjects();
    } catch {
      toast.error("Failed to update assignment");
    }
  }

  async function fetchProjects() {
    const supabase = createClient();
    const { data } = await supabase
      .from("projects")
      .select("*, project_members(id, user_id, user:users(id, name, role))")
      .order("name");
    if (data) setProjects(data);
  }

  function openCreate() {
    setFormName("");
    setFormDesc("");
    setFormLeaders([currentUser.id]);
    setIsCreateOpen(true);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}
          </p>
          <Button
            variant={showMyProjects ? "default" : "outline"}
            size="sm"
            onClick={() => setShowMyProjects(!showMyProjects)}
            className="text-xs h-7"
          >
            {showMyProjects ? <Check className="h-3 w-3 mr-1" /> : null}
            My Projects
          </Button>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="space-y-3">
        {filteredProjects.map((project: any) => {
          const isExpanded = expandedId === project.id;
          const projectLeaders =
            project.project_members?.filter(
              (pm: any) => pm.user?.role === "leader"
            ) || [];
          const projectMembers =
            project.project_members?.filter(
              (pm: any) => pm.user?.role === "member"
            ) || [];
          const search = (memberSearch[project.id] || "").toLowerCase();
          const filteredLeaders = search
            ? leaders.filter((l) => l.name.toLowerCase().includes(search))
            : leaders;
          const filteredMembers = search
            ? members.filter((m) => m.name.toLowerCase().includes(search))
            : members;

          return (
            <Card key={project.id}>
              <CardContent className="p-4">
                {/* Header */}
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => toggleExpand(project.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{project.name}</p>
                    {project.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <Users className="h-3 w-3" />
                      {projectLeaders.length}L / {projectMembers.length}M
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(project);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    {/* Member search */}
                    <div className="relative mb-4">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search members..."
                        value={memberSearch[project.id] || ""}
                        onChange={(e) =>
                          setMemberSearch((prev) => ({
                            ...prev,
                            [project.id]: e.target.value,
                          }))
                        }
                        className="pl-8 h-8 text-sm"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Leaders */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                          Leaders
                        </p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {filteredLeaders.map((l) => {
                            const isAssigned = project.project_members?.some(
                              (pm: any) => pm.user_id === l.id
                            );
                            return (
                              <label
                                key={l.id}
                                className="flex items-center gap-2 text-sm cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  onChange={() =>
                                    toggleMember(project.id, l.id, isAssigned)
                                  }
                                  className="rounded border-border"
                                />
                                {l.name}
                              </label>
                            );
                          })}
                          {filteredLeaders.length === 0 && (
                            <p className="text-xs text-muted-foreground">No leaders found</p>
                          )}
                        </div>
                      </div>

                      {/* Members */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                          Members
                        </p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {filteredMembers.map((m) => {
                            const isAssigned = project.project_members?.some(
                              (pm: any) => pm.user_id === m.id
                            );
                            return (
                              <label
                                key={m.id}
                                className="flex items-center gap-2 text-sm cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  onChange={() =>
                                    toggleMember(project.id, m.id, isAssigned)
                                  }
                                  className="rounded border-border"
                                />
                                {m.name}
                              </label>
                            );
                          })}
                          {filteredMembers.length === 0 && (
                            <p className="text-xs text-muted-foreground">No members found</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(project.id)}
                        className="gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Project
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Initial Leaders</Label>
              <div className="space-y-1.5">
                {leaders.map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formLeaders.includes(l.id)}
                      onChange={(e) =>
                        setFormLeaders((prev) =>
                          e.target.checked
                            ? [...prev, l.id]
                            : prev.filter((id) => id !== l.id)
                        )
                      }
                      className="rounded border-border"
                    />
                    {l.name}
                    {l.id === currentUser.id && (
                      <span className="text-xs text-muted-foreground">(you)</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

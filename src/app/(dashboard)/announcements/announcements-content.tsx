"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, Megaphone, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import type { User } from "@/lib/types";

interface AnnouncementsContentProps {
  currentUser: User;
  initialAnnouncements: any[];
}

export function AnnouncementsContent({
  currentUser,
  initialAnnouncements,
}: AnnouncementsContentProps) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");

  function openCreate() {
    setFormTitle("");
    setFormContent("");
    setEditing(null);
    setIsDialogOpen(true);
  }

  function openEdit(a: any) {
    setFormTitle(a.title);
    setFormContent(a.content);
    setEditing(a);
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setIsSubmitting(true);
    const supabase = createClient();

    try {
      if (editing) {
        const { error } = await supabase
          .from("announcements")
          .update({
            title: formTitle,
            content: formContent,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Announcement updated");
      } else {
        const { error } = await supabase.from("announcements").insert({
          title: formTitle,
          content: formContent,
          author_id: currentUser.id,
        });
        if (error) throw error;
        toast.success("Announcement created");
      }
      await fetchAnnouncements();
      setIsDialogOpen(false);
    } catch {
      toast.error("Failed to save announcement");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this announcement?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Announcement deleted");
    setAnnouncements((prev: any[]) => prev.filter((a) => a.id !== id));
  }

  async function fetchAnnouncements() {
    const supabase = createClient();
    const { data } = await supabase
      .from("announcements")
      .select("*, author:users(name)")
      .order("created_at", { ascending: false });
    if (data) setAnnouncements(data);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {announcements.length} announcement{announcements.length !== 1 ? "s" : ""}
        </p>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Announcement
        </Button>
      </div>

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <div className="text-center py-12">
            <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              No announcements yet
            </p>
          </div>
        ) : (
          announcements.map((a: any) => (
            <Card key={a.id} className="transition-all hover:shadow-md">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {a.content}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50">
                      {a.author?.name || "HR"} &middot;{" "}
                      {format(new Date(a.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEdit(a)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Announcement" : "New Announcement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Announcement title"
              />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Write your announcement..."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? "Update" : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

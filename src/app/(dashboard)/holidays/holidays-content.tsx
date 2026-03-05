"use client";

import { useState } from "react";
import { format, isPast, parseISO } from "date-fns";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Calendar,
  MapPin,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Holiday } from "@/lib/types";

interface HolidaysContentProps {
  initialHolidays: Holiday[];
}

export function HolidaysContent({ initialHolidays }: HolidaysContentProps) {
  const [holidays, setHolidays] = useState(initialHolidays);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formObserved, setFormObserved] = useState("");
  const [formOriginal, setFormOriginal] = useState("");
  const [formLocal, setFormLocal] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const upcoming = holidays.filter((h) => h.observed_date >= today);
  const localCount = holidays.filter((h) => h.is_local).length;

  const filtered = holidays.filter(
    (h) =>
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.observed_date.includes(search)
  );

  function openCreate() {
    setFormName("");
    setFormObserved("");
    setFormOriginal("");
    setFormLocal(false);
    setEditingHoliday(null);
    setIsDialogOpen(true);
  }

  function openEdit(h: Holiday) {
    setFormName(h.name);
    setFormObserved(h.observed_date);
    setFormOriginal(h.original_date || "");
    setFormLocal(h.is_local);
    setEditingHoliday(h);
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!formName.trim() || !formObserved) {
      toast.error("Name and observed date are required");
      return;
    }
    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const data = {
        name: formName,
        observed_date: formObserved,
        original_date: formOriginal || null,
        is_local: formLocal,
      };

      if (editingHoliday) {
        const { error } = await supabase
          .from("holidays")
          .update(data)
          .eq("id", editingHoliday.id);
        if (error) throw error;
        toast.success("Holiday updated");
      } else {
        const { error } = await supabase.from("holidays").insert(data);
        if (error) throw error;
        toast.success("Holiday added");
      }

      await fetchHolidays();
      setIsDialogOpen(false);
    } catch {
      toast.error("Failed to save holiday");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this holiday?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Holiday deleted");
    setHolidays((prev) => prev.filter((h) => h.id !== id));
  }

  async function fetchHolidays() {
    const supabase = createClient();
    const { data } = await supabase
      .from("holidays")
      .select("*")
      .order("observed_date", { ascending: true });
    if (data) setHolidays(data);
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Calendar className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{holidays.length}</p>
              <p className="text-xs text-muted-foreground">Total Holidays</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-500/10 p-2">
              <Calendar className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{upcoming.length}</p>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <MapPin className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{localCount}</p>
              <p className="text-xs text-muted-foreground">Local Holidays</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search holidays..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Holiday
        </Button>
      </div>

      {/* Holiday List */}
      <div className="space-y-2">
        {filtered.map((h) => {
          const past = h.observed_date < today;
          return (
            <Card key={h.id} className={cn(past && "opacity-50")}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{h.name}</span>
                    {h.is_local && (
                      <Badge variant="secondary" className="text-[10px]">
                        Local
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>
                      {format(parseISO(h.observed_date), "MMM d, yyyy")}
                    </span>
                    {h.original_date && (
                      <span>
                        Originally:{" "}
                        {format(parseISO(h.original_date), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => openEdit(h)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(h.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingHoliday ? "Edit Holiday" : "Add Holiday"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Holiday Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. New Year's Day"
              />
            </div>
            <div className="space-y-2">
              <Label>Observed Date</Label>
              <Input
                type="date"
                value={formObserved}
                onChange={(e) => setFormObserved(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Original Date (optional)</Label>
              <Input
                type="date"
                value={formOriginal}
                onChange={(e) => setFormOriginal(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formLocal} onCheckedChange={setFormLocal} />
              <Label>Local Holiday</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingHoliday ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerButtonProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  mode?: "day" | "month";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "start" | "center" | "end";
  dateFormat?: string;
  size?: "sm" | "default";
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function MonthPicker({ value, onChange, onClose }: { value: Date | null; onChange: (d: Date) => void; onClose: () => void }) {
  const [year, setYear] = useState(value ? value.getFullYear() : new Date().getFullYear());

  return (
    <div className="p-3 space-y-3 w-56">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">{year}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {MONTH_NAMES.map((name, idx) => {
          const isSelected = value && value.getFullYear() === year && value.getMonth() === idx;
          return (
            <Button
              key={name}
              variant={isSelected ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                onChange(new Date(year, idx, 1));
                onClose();
              }}
            >
              {name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function DatePickerButton({
  value,
  onChange,
  mode = "day",
  placeholder = "Select date",
  disabled,
  className,
  align = "start",
  dateFormat,
  size = "default",
}: DatePickerButtonProps) {
  const [open, setOpen] = useState(false);

  const fmt = dateFormat ?? (mode === "month" ? "MMMM yyyy" : "MMM d, yyyy");
  const label = value ? format(value, fmt) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={size}
          disabled={disabled}
          className={cn(
            "justify-start gap-2 font-normal bg-background border-border",
            size === "sm" ? "h-8 text-sm" : "",
            !label && "text-muted-foreground/70",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {label ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        {mode === "month" ? (
          <MonthPicker
            value={value}
            onChange={onChange}
            onClose={() => setOpen(false)}
          />
        ) : (
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={(d) => {
              onChange(d ?? null);
              setOpen(false);
            }}
            initialFocus
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

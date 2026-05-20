"use client";

import { format, addDays, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { DatePickerButton } from "@/components/ui/date-picker-button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DateNavProps {
  date: Date;
  onDateChange: (date: Date) => void;
}

export function DateNav({ date, onDateChange }: DateNavProps) {
  const isToday =
    format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onDateChange(subDays(date, 1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <DatePickerButton
        value={date}
        onChange={(d) => d && onDateChange(d)}
        align="center"
        dateFormat="EEE, MMM d, yyyy"
        className="min-w-[180px]"
      />

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={() => onDateChange(addDays(date, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {!isToday && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDateChange(new Date())}
        >
          Today
        </Button>
      )}
    </div>
  );
}

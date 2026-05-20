"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface NumericInputProps {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function NumericInput({
  value,
  onChange,
  label,
  min,
  max,
  step = 1,
  disabled,
  className,
  placeholder = "0",
}: NumericInputProps) {
  const [local, setLocal] = useState(value === 0 ? "" : String(value));

  useEffect(() => {
    setLocal(value === 0 ? "" : String(value));
  }, [value]);

  const input = (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const parsed = local === "" ? 0 : parseFloat(local);
        const safe = isNaN(parsed) ? 0 : parsed;
        setLocal(safe === 0 ? "" : String(safe));
        onChange(safe);
      }}
      className={cn(
        "bg-background border-border h-8 text-sm",
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
    />
  );

  if (label) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {input}
      </div>
    );
  }

  return input;
}

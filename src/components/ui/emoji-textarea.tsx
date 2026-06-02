"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Smile } from "lucide-react";
import data from "@emoji-mart/data";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Load picker client-side only — it references browser globals
const Picker = dynamic(
  () => import("@emoji-mart/react").then((m) => m.default),
  { ssr: false }
);

interface EmojiTextareaProps extends React.ComponentProps<"textarea"> {
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
}

export const EmojiTextarea = React.forwardRef<
  HTMLTextAreaElement,
  EmojiTextareaProps
>(({ value, onChange, ...props }, ref) => {
  const internalRef = React.useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = React.useState(false);

  // Forward external ref while keeping our own internal handle
  React.useImperativeHandle(ref, () => internalRef.current!);

  function handleEmojiSelect(emoji: { native: string }) {
    const el = internalRef.current;
    if (!el || !onChange) return;

    const start = el.selectionStart ?? (value ?? "").length;
    const end = el.selectionEnd ?? start;
    const current = value ?? "";
    const next = current.slice(0, start) + emoji.native + current.slice(end);

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    nativeInputValueSetter?.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));

    // Synthetic event for React controlled state
    const syntheticEvent = {
      target: { ...el, value: next },
      currentTarget: { ...el, value: next },
    } as React.ChangeEvent<HTMLTextAreaElement>;
    onChange(syntheticEvent);

    // Restore focus and move cursor after inserted emoji
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.native.length;
      el.setSelectionRange(pos, pos);
    });

    setOpen(false);
  }

  return (
    <div className="relative">
      <Textarea ref={internalRef} value={value} onChange={onChange} {...props} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="absolute bottom-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open emoji picker"
          >
            <Smile className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 border-none shadow-none bg-transparent"
          align="end"
          side="top"
        >
          <Picker
            data={data}
            theme="dark"
            onEmojiSelect={handleEmojiSelect}
            previewPosition="none"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
});

EmojiTextarea.displayName = "EmojiTextarea";

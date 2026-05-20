import { cn, getInitials } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-sm",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-lg",
  xl: "h-16 w-16 text-xl",
};

export function UserAvatar({ name, size = "md", className }: UserAvatarProps) {
  return (
    <div
      className={cn(
        "rounded-full bg-primary dark:bg-gradient-to-br dark:from-blue-500 dark:to-indigo-600 flex items-center justify-center shrink-0 font-bold text-primary-foreground",
        SIZE_CLASSES[size],
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}

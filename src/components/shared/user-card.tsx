import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

interface UserCardProps {
  name: string;
  department?: string | null;
  avatarSize?: "xs" | "sm" | "md" | "lg";
  onClick?: () => void;
  locked?: boolean;
  className?: string;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
}

export function UserCard({
  name,
  department,
  avatarSize = "md",
  onClick,
  locked,
  className,
  headerActions,
  children,
}: UserCardProps) {
  return (
    <Card
      className={cn(
        "group transition-all hover:shadow-sm hover:border-border/80",
        onClick && "cursor-pointer",
        locked && "opacity-75",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <UserAvatar name={name} size={avatarSize} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{name}</p>
            {department !== undefined && (
              <p className="text-xs text-muted-foreground truncate">{department ?? "—"}</p>
            )}
          </div>
          {headerActions && (
            <div className="flex items-center gap-1 shrink-0">{headerActions}</div>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

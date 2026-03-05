import { ShieldAlert } from "lucide-react";

export function AccessDenied() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-8 w-8 text-destructive" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You don&apos;t have permission to view this page.
        </p>
      </div>
    </div>
  );
}

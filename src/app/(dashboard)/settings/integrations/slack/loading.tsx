import { Skeleton } from "@/components/ui/skeleton";

export default function SlackIntegrationLoading() {
  return (
    <div className="space-y-6 max-w-2xl">
      <Skeleton className="h-4 w-full" />

      {/* Prerequisites card */}
      <div className="rounded-xl border border-border/60 bg-muted/30 p-5 space-y-3">
        <Skeleton className="h-4 w-36" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>

      {/* Connection status card */}
      <div className="rounded-xl border border-border/60 bg-muted/30 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-2.5 w-2.5 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      {/* How to use card */}
      <div className="rounded-xl border border-border/60 bg-muted/30 p-5 space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

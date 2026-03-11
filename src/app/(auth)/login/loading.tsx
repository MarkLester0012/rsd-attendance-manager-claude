import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* Animated floating orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="orb-1 absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-600/20 blur-3xl" />
        <div className="orb-2 absolute top-3/4 right-1/4 h-96 w-96 rounded-full bg-gradient-to-br from-emerald-500/15 to-cyan-500/15 blur-3xl" />
        <div className="orb-3 absolute bottom-1/4 left-1/3 h-80 w-80 rounded-full bg-gradient-to-br from-pink-500/15 to-orange-400/15 blur-3xl" />
        <div className="orb-4 absolute top-1/3 right-1/3 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/20 to-blue-400/20 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Branding skeleton */}
        <div className="mb-8 flex flex-col items-center">
          <Skeleton className="mb-4 h-16 w-16 rounded-2xl" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-4 w-36" />
        </div>

        {/* Form card skeleton */}
        <div className="glass-strong rounded-2xl p-8 shadow-2xl">
          <Skeleton className="mb-1 h-6 w-32" />
          <Skeleton className="mb-6 h-4 w-44" />

          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
    </div>
  );
}

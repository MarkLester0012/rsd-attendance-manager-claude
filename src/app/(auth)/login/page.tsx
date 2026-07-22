"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  const [transitioning, setTransitioning] = useState(false);
  const router = useRouter();

  const handleLoginSuccess = useCallback(() => {
    setTransitioning(true);

    // Navigate after animation completes
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 800);
  }, [router]);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* Texture layer */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,_hsl(var(--foreground)/0.05),_transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.15] dark:opacity-10 bg-[linear-gradient(to_right,_hsl(var(--foreground)/0.06)_1px,_transparent_1px),linear-gradient(to_bottom,_hsl(var(--foreground)/0.06)_1px,_transparent_1px)] bg-[length:44px_44px]" />

      {/* Animated floating orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="orb-1 absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-red-600/25 to-rose-500/20 dark:from-red-600/20 dark:to-rose-500/15 blur-3xl" />
        <div className="orb-2 absolute top-3/4 right-1/4 h-96 w-96 rounded-full bg-gradient-to-br from-zinc-400/15 to-zinc-600/10 dark:from-zinc-400/10 dark:to-zinc-600/10 blur-3xl" />
        <div className="orb-3 absolute bottom-1/4 left-1/3 h-80 w-80 rounded-full bg-gradient-to-br from-white/25 to-zinc-400/10 dark:from-white/10 dark:to-zinc-400/10 blur-3xl" />
        <div className="orb-4 absolute top-1/3 right-1/3 h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/20 to-zinc-500/10 dark:from-rose-500/15 dark:to-zinc-500/10 blur-3xl" />
      </div>

      {/* Zoom-through layer: the whole login content zooms forward */}
      <div
        className={`relative z-10 w-full max-w-md px-4 ${
          transitioning ? "animate-zoom-through pointer-events-none" : "animate-fade-in"
        }`}
      >
        {/* Branding */}
        <div
          className="mb-8 text-center opacity-0 animate-fade-in"
          style={{ animationDelay: "100ms", animationFillMode: "both" }}
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <Image
              src="/logo.png"
              alt="Ring System Development Logo"
              width={64}
              height={64}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Ring System Development
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance Manager
          </p>
        </div>

        {/* Glass card */}
        <div
          className="glass-strong rounded-2xl p-8 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 opacity-0 animate-fade-in"
          style={{ animationDelay: "200ms", animationFillMode: "both" }}
        >
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              Welcome back
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to your account
            </p>
          </div>
          <LoginForm onLoginSuccess={handleLoginSuccess} />
        </div>

        {/* Footer */}
        <p
          className="mt-6 text-center text-xs text-muted-foreground/60 opacity-0 animate-fade-in"
          style={{ animationDelay: "300ms", animationFillMode: "both" }}
        >
          &copy; {new Date().getFullYear()} Ring System Development. All rights
          reserved.
        </p>
      </div>

      {/* Portal flash overlay */}
      {transitioning && (
        <div className="fixed inset-0 z-50 animate-portal-flash">
          <div className="absolute inset-0 bg-gradient-radial from-red-500/30 via-rose-500/20 to-background" />
        </div>
      )}
    </div>
  );
}

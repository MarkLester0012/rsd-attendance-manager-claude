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
      {/* Animated floating orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="orb-1 absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-600/20 blur-3xl" />
        <div className="orb-2 absolute top-3/4 right-1/4 h-96 w-96 rounded-full bg-gradient-to-br from-emerald-500/15 to-cyan-500/15 blur-3xl" />
        <div className="orb-3 absolute bottom-1/4 left-1/3 h-80 w-80 rounded-full bg-gradient-to-br from-pink-500/15 to-orange-400/15 blur-3xl" />
        <div className="orb-4 absolute top-1/3 right-1/3 h-64 w-64 rounded-full bg-gradient-to-br from-indigo-500/20 to-blue-400/20 blur-3xl" />
      </div>

      {/* Zoom-through layer: the whole login content zooms forward */}
      <div
        className={`relative z-10 w-full max-w-md px-4 ${
          transitioning ? "animate-zoom-through pointer-events-none" : "animate-fade-in"
        }`}
      >
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <Image
              src="/logo.png"
              alt="Ring Systems Development Logo"
              width={64}
              height={64}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Ring Systems Development
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance Manager
          </p>
        </div>

        {/* Glass card */}
        <div className="glass-strong rounded-2xl p-8 shadow-2xl">
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
        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          &copy; {new Date().getFullYear()} Ring Systems Development. All rights
          reserved.
        </p>
      </div>

      {/* Portal flash overlay */}
      {transitioning && (
        <div className="fixed inset-0 z-50 animate-portal-flash">
          <div className="absolute inset-0 bg-gradient-radial from-blue-500/30 via-indigo-500/20 to-background" />
        </div>
      )}
    </div>
  );
}

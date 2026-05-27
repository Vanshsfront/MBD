import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — MBD Clinic OS" };

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-app p-6">
      {/* Soft warm glow orbs lifted from the legacy login screen — they sit
       * behind the card to give the warm Cal-AI atmosphere instead of a
       * flat page. Positioned absolutely so they don't affect layout. */}
      <div
        className="glow-orb"
        style={{ top: "-10%", left: "-8%", width: "26rem", height: "26rem", background: "#fbd9c8" }}
      />
      <div
        className="glow-orb"
        style={{ top: "20%", right: "-12%", width: "30rem", height: "30rem", background: "#cfe4f4" }}
      />
      <div
        className="glow-orb"
        style={{ bottom: "-12%", left: "30%", width: "24rem", height: "24rem", background: "#c8e7dd" }}
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--text-primary)] text-2xl font-black text-white shadow-[0_8px_24px_-8px_rgba(26,26,30,0.45)]">
            M
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-[color:var(--text-primary)]">
              MBD Clinic OS
            </h1>
            <p className="text-sm text-[color:var(--text-secondary)]">
              Movement By Design
            </p>
          </div>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <div className="flex items-center justify-center gap-4 text-[11px] text-[color:var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="pulse-dot" />
            System online
          </span>
          <span className="h-1 w-1 rounded-full bg-[color:var(--text-tertiary)]/40" />
          <span>HIPAA aligned</span>
        </div>
      </div>
    </div>
  );
}

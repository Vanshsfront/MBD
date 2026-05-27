"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
      } else if (result?.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-app font-sans antialiased min-h-screen flex items-center justify-center overflow-hidden relative">
      {/* Background Glow Orbs — warm peach + sage tones */}
      <div className="absolute rounded-full blur-[100px] z-0 opacity-30 w-[500px] h-[500px] -top-48 -left-48 pointer-events-none" style={{ background: '#e9a089' }}></div>
      <div className="absolute rounded-full blur-[100px] z-0 opacity-25 w-[400px] h-[400px] -bottom-24 -right-24 pointer-events-none" style={{ background: '#5ba4d9' }}></div>
      <div className="absolute rounded-full blur-[100px] z-0 opacity-20 w-[300px] h-[300px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ background: '#3d9b8f' }}></div>

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo Area */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-2xl bg-text-primary flex items-center justify-center shadow-lg" style={{ boxShadow: '0 8px 24px -4px rgba(26, 26, 30, 0.2)' }}>
              <span className="font-black text-2xl tracking-tight leading-none" style={{ color: 'var(--background)' }}>
                M
              </span>
            </div>
            <h1 className="text-3xl font-black text-text-primary tracking-tighter">MBD</h1>
          </div>
          <p className="text-text-tertiary font-medium tracking-wide text-sm uppercase">Movement By Design</p>
        </div>

        {/* Login Card — Neumorphic */}
        <div className="neumorphic-card p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-text-primary mb-2">Welcome Back</h2>
            <p className="text-text-secondary text-sm">Please enter your professional credentials to access the dashboard.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-semibold text-text-secondary ml-1">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-text-primary transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <input 
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-surface-secondary border border-border-light rounded-xl py-4 pl-11 pr-4 text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all" 
                  placeholder="name@clinic.com" 
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label htmlFor="password" className="text-sm font-semibold text-text-secondary">Password</label>
                <a className="text-xs font-bold text-text-primary hover:opacity-70 transition-opacity uppercase tracking-wider" href="#">Forgot Password?</a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-text-primary transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input 
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-surface-secondary border border-border-light rounded-xl py-4 pl-11 pr-12 text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring transition-all" 
                  placeholder="••••••••" 
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-tertiary hover:text-text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200/60 rounded-xl px-4 py-3 text-center">
                {error}
              </div>
            )}

            {/* Sign In Button — Cal AI dark primary */}
            <button 
              type="submit"
              disabled={loading}
              className="w-full btn-primary-dark disabled:opacity-60 disabled:cursor-not-allowed py-4 text-base font-semibold flex items-center justify-center gap-2 press-scale"
              style={{ boxShadow: '0 4px 16px -4px rgba(26, 26, 30, 0.2)' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Connecting...
                </span>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            {/* Footer Links */}
            <div className="pt-4 text-center border-t border-border-light">
              <p className="text-text-secondary text-sm">
                New practitioner?{" "}
                <a className="text-text-primary font-bold hover:opacity-70 transition-opacity" href="#">Contact administration</a>
              </p>
            </div>
          </form>
        </div>

        {/* System Status */}
        <div className="mt-8 flex justify-center items-center gap-6 text-[11px] font-bold uppercase tracking-[0.2em] text-text-tertiary">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-subtle-pulse"></span>
            <span>System Online</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span>HIPAA Compliant</span>
          </div>
        </div>
      </div>
    </div>
  );
}

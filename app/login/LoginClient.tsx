"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthFrame } from "@/app/component/auth/AuthFrame";
import { safeNextPath } from "@/lib/http/safe-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() =>
    searchParams.get("error") === "link_expired" ? "That email link has expired or was already used. Request a new one." : "",
  );
  const [message, setMessage] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setLoading(true);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) return setError(error.message);
      // Only same-origin relative paths are honoured (no open redirect).
      router.replace(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setMessage("");
    if (!email.trim()) return setError("Enter your email address first.");
    setLoading(true);
    try {
      const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (error) setError(error.message);
      else setMessage("If an account exists for that email, a reset link is on its way.");
    } catch {
      setError("We couldn't send the reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      title="Sign in"
      subtitle="Welcome back. Your studio is where you left it."
      footer={<>New to StreamLounge? <Link href="/signup" className="text-[color:var(--sl-fg)] underline underline-offset-4">Create an account</Link></>}
    >
      <form onSubmit={handleLogin} className="space-y-4" noValidate>
        <label className="block"><span className="sl-label">Email</span><input className="sl-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="block">
          <span className="flex items-baseline justify-between"><span className="sl-label">Password</span>
            <button type="button" className="sl-muted text-[12.5px] hover:text-[color:var(--sl-fg)]" onClick={handleForgotPassword} disabled={loading}>Forgot password?</button>
          </span>
          <input className="sl-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="rounded-md p-3 text-[13px]" style={{ background: "var(--sl-danger-soft)", color: "var(--sl-danger)" }}>{error}</p>}
        {message && <p role="status" className="rounded-md p-3 text-[13px]" style={{ background: "var(--sl-success-soft)", color: "var(--sl-success)" }}>{message}</p>}
        <button type="submit" className="sl-btn sl-btn-primary sl-btn-lg w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
    </AuthFrame>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

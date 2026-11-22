"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AuthFrame } from "@/app/component/auth/AuthFrame";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SignupClient() {
  const router = useRouter();
  const [creatorName, setCreatorName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setSuccess("");
    if (!creatorName.trim()) return setError("Enter your creator name.");
    if (!email.trim()) return setError("Enter your email.");
    if (password.length < 10) return setError("Use a password of at least 10 characters.");
    if (!agree) return setError("Please accept the terms and fee policy to continue.");
    setLoading(true);
    try {
      const { data, error } = await getSupabaseBrowserClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { creator_name: creatorName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) return setError(error.message);
      if (data.session) return router.replace("/dashboard");
      if (data.user) setSuccess("Check your inbox to confirm your email, then sign in.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      title="Create your page"
      subtitle="Set up in minutes. Stream to YouTube, Twitch or Kick with the StreamLounge overlay."
      footer={<>Already have an account? <Link href="/login" className="text-[color:var(--sl-fg)] underline underline-offset-4">Sign in</Link></>}
    >
      {success ? (
        <div className="sl-card p-6">
          <p className="text-[15px] font-medium">Almost there</p>
          <p className="sl-body sl-muted mt-2">{success}</p>
          <Link href="/login" className="sl-btn sl-btn-primary mt-5">Go to sign in</Link>
        </div>
      ) : (
        <form onSubmit={handleSignup} className="space-y-4" noValidate>
          <label className="block"><span className="sl-label">Creator name</span><input className="sl-input" autoComplete="nickname" maxLength={60} value={creatorName} onChange={(e) => setCreatorName(e.target.value)} /></label>
          <label className="block"><span className="sl-label">Email</span><input className="sl-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="block"><span className="sl-label">Password</span><input className="sl-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /><span className="sl-hint block">At least 10 characters.</span></label>
          <label className="flex items-start gap-3 text-[13px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[color:var(--sl-accent)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="sl-muted">
              I agree to the <Link href="/legal/terms" className="underline underline-offset-2">Terms</Link> and understand the{" "}
              <Link href="/legal/fees" className="underline underline-offset-2">fees</Link>: 8% on StreamLounge QR superchats, 0% on my own Razorpay link.
            </span>
          </label>
          {error && <p role="alert" className="rounded-md p-3 text-[13px]" style={{ background: "var(--sl-danger-soft)", color: "var(--sl-danger)" }}>{error}</p>}
          <button type="submit" className="sl-btn sl-btn-primary sl-btn-lg w-full" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
        </form>
      )}
    </AuthFrame>
  );
}

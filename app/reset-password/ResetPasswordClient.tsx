"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AuthFrame } from "@/app/component/auth/AuthFrame";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Reached from the password-reset email via /auth/callback, which has already
 * exchanged the email link for a session. The signed-in user sets a new
 * password here.
 */
export default function ResetPasswordClient() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(
          updateError.message.toLowerCase().includes("session")
            ? "This reset link has expired. Request a new one from the sign-in page."
            : updateError.message,
        );
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame title="Choose a new password" subtitle="Use at least 8 characters. You'll be signed in afterwards.">
      {done ? (
        <p role="status" className="rounded-md p-3 text-[13px]" style={{ background: "var(--sl-success-soft)", color: "var(--sl-success)" }}>Password updated. Taking you to your studio…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block"><span className="sl-label">New password</span><input className="sl-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <label className="block"><span className="sl-label">Confirm password</span><input className="sl-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
          {error && <p role="alert" className="rounded-md p-3 text-[13px]" style={{ background: "var(--sl-danger-soft)", color: "var(--sl-danger)" }}>{error}</p>}
          <button type="submit" className="sl-btn sl-btn-primary sl-btn-lg w-full" disabled={loading}>{loading ? "Saving…" : "Update password"}</button>
        </form>
      )}
    </AuthFrame>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
    <main className="flex min-h-screen items-center justify-center bg-[#05070d] px-4 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6"
      >
        <h1 className="text-xl font-semibold">Choose a new password</h1>

        {done ? (
          <p className="text-sm text-emerald-300">Password updated. Taking you to your dashboard…</p>
        ) : (
          <>
            <label className="block text-sm">
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              />
            </label>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#4D8AFF] px-4 py-2 font-medium disabled:opacity-60"
            >
              {loading ? "Saving…" : "Save password"}
            </button>
          </>
        )}

        <p className="text-center text-sm text-white/60">
          <Link href="/login" className="underline">Back to sign in</Link>
        </p>
      </form>
    </main>
  );
}

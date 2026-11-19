"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/http/safe-redirect";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function LoginForm() {
  const supabase = getSupabaseBrowserClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() =>
    searchParams.get("error") === "link_expired"
      ? "That email link has expired or was already used. Request a new one."
      : "",
  );
  const [message, setMessage] = useState("");

  async function handleLogin() {
    setError("");
    setMessage("");

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // The proxy appends ?next= when it redirects an unauthenticated visitor,
      // so send them on to where they were headed. Only same-origin relative
      // paths are honoured — an absolute URL here would be an open redirect.
      // replace + refresh: the back button shouldn't return to the form, and
      // the router must re-request pages now that the session cookie exists.
      router.replace(safeNextPath(searchParams.get("next")));
      router.refresh();
      return;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        }
      );

      if (error) {
        setError(error.message);
      } else {
        setMessage("Password reset email sent. Check your inbox.");
      }
    } catch {
      setError("Unable to send the reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ss-login relative isolate min-h-screen overflow-hidden text-white">
      <style jsx global>{`
        .ss-login,
        .ss-login * {
          box-sizing: border-box;
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        }

        /* Exact reference-inspired midnight navy and lavender glow */
        .ss-login {
          background:
            radial-gradient(
              ellipse 68% 78% at 24% 49%,
              rgba(126, 105, 190, 0.88) 0%,
              rgba(91, 73, 151, 0.68) 25%,
              rgba(52, 53, 100, 0.42) 48%,
              transparent 76%
            ),
            linear-gradient(
              112deg,
              #0a2137 0%,
              #111f3b 48%,
              #0a2137 100%
            );
          background-attachment: fixed;
        }

        .ss-login-grid {
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
          background-size: 64px 64px;
          mask-image: linear-gradient(to bottom, black, transparent 90%);
        }

        .ss-login-orb {
          position: absolute;
          width: 340px;
          height: 340px;
          border-radius: 50%;
          filter: blur(110px);
          pointer-events: none;
          opacity: 0.12;
          animation: ss-login-float 14s ease-in-out infinite alternate;
        }

        .ss-login-orb-a {
          background: #a78bfa;
          top: 20%;
          left: -190px;
        }

        .ss-login-orb-b {
          background: #4d8aff;
          bottom: -190px;
          right: -120px;
          animation-delay: -5s;
        }

        @keyframes ss-login-float {
          from {
            transform: translate3d(0, 0, 0);
          }
          to {
            transform: translate3d(25px, -20px, 0);
          }
        }

        @keyframes ss-login-enter {
          from {
            opacity: 0;
            transform: translateY(14px);
            filter: blur(3px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }

        .ss-login-enter {
          animation: ss-login-enter 0.9s ease-out both;
        }

        .ss-login-delay-1 {
          animation-delay: 0.16s;
        }

        .ss-login-panel {
          background: rgba(10, 25, 43, 0.76);
          border-color: rgba(255, 255, 255, 0.16);
          box-shadow: 0 28px 90px rgba(2, 8, 20, 0.2);
          backdrop-filter: blur(24px);
        }

        .ss-login-input {
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            background 180ms ease;
        }

        .ss-login-input:focus {
          border-color: #6ccEB0;
          background: rgba(10, 33, 55, 0.85);
          box-shadow: 0 0 0 3px rgba(108, 206, 176, 0.13);
          outline: none;
        }

        .ss-login-button {
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            opacity 180ms ease;
        }

        .ss-login-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(77, 138, 255, 0.24);
        }

        @media (prefers-reduced-motion: reduce) {
          .ss-login-enter,
          .ss-login-orb {
            animation: none;
          }

          .ss-login-button,
          .ss-login-input {
            transition: none;
          }
        }
      `}</style>

      <div className="ss-login-orb ss-login-orb-a" />
      <div className="ss-login-orb ss-login-orb-b" />
      <div className="ss-login-grid pointer-events-none absolute inset-0" />

      {/* Navigation */}
      <nav className="relative z-10 border-b border-white/10 bg-[#0A2137]/35 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-xl text-[#6CCEB0]">
              ϟ
            </span>
            <span className="text-xl font-medium tracking-tight">
              Stream<span className="text-[#6CCEB0]">Lounge</span>
            </span>
          </Link>

          <div className="text-sm text-white/70">
            New here?{" "}
            <Link
              href="/signup"
              className="font-medium text-white transition hover:text-[#6CCEB0]"
            >
              Create account ↗
            </Link>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-81px)] max-w-7xl items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_0.78fr] lg:gap-20 lg:py-16">

        {/* Branding */}
        <div className="ss-login-enter hidden lg:block">
          <p className="mb-8 text-xs font-medium uppercase tracking-[0.28em] text-white/70">
            Your creator space
          </p>

          <h1 className="max-w-2xl text-5xl font-light leading-[1.1] tracking-[-0.055em] xl:text-7xl">
            Pick up where
            <br />
            your community
            <br />
            <span className="text-[#D1C6F2]">left off.</span>
          </h1>

          <p className="mt-7 max-w-lg text-base font-light leading-8 text-white/70 xl:text-lg">
            Your stream, your people, your rules. Step back into
            the space where every interaction becomes part of the show.
          </p>

          {/* Creator preview */}
          <div className="relative mt-10 max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-[#0A2137]/30 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#544388] to-[#4D8AFF] text-lg font-medium">
                  S
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    Your creator dashboard
                  </p>
                  <p className="mt-1 text-xs text-white/55">
                    One space. Every interaction.
                  </p>
                </div>
              </div>

              <span className="rounded-full border border-[#6CCEB0]/30 bg-[#6CCEB0]/10 px-3 py-1 text-[10px] font-medium tracking-wider text-[#6CCEB0]">
                READY
              </span>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { icon: "✳", name: "Interactions", detail: "Engage live" },
                { icon: "♫", name: "Soundboard", detail: "Set the mood" },
                { icon: "◎", name: "Community", detail: "Bring them in" },
              ].map((item) => (
                <div
                  key={item.name}
                  className="rounded-xl border border-white/10 bg-[#0A2137]/45 p-3.5"
                >
                  <span className="text-xl text-[#C7B8F0]">{item.icon}</span>
                  <p className="mt-4 text-xs font-medium text-white/90">
                    {item.name}
                  </p>
                  <p className="mt-1 text-[10px] text-white/55">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6CCEB0]/10 text-sm text-[#6CCEB0]">
                ✓
              </span>
              <p className="text-xs leading-5 text-white/65">
                Everything in sync, so you can focus on the show.
              </p>
            </div>
          </div>

          <p className="mt-6 text-xs tracking-[0.16em] text-white/50">
            BUILT FOR CREATORS · MADE FOR COMMUNITY
          </p>
        </div>

        {/* Login form */}
        <div className="ss-login-enter ss-login-delay-1 mx-auto w-full max-w-[440px]">
          <div className="ss-login-panel rounded-3xl border p-6 sm:p-9">
            <div className="mb-8">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-2xl font-light text-[#6CCEB0]">
                ϟ
              </div>

              <p className="mb-2 text-[11px] font-medium tracking-[0.22em] text-[#6CCEB0]">
                WELCOME BACK
              </p>

              <h2 className="text-3xl font-light tracking-[-0.04em] sm:text-4xl">
                Sign in<span className="text-[#6CCEB0]">.</span>
              </h2>

              <p className="mt-3 text-sm font-light leading-6 text-white/65">
                Your next great stream starts here.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!loading) handleLogin();
              }}
            >
              <div>
                <label
                  htmlFor="login-email"
                  className="text-sm font-medium text-white/85"
                >
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="ss-login-input mt-2.5 w-full rounded-xl border border-white/15 bg-[#0A2137]/65 px-4 py-3.5 text-sm text-white placeholder:text-white/40"
                />
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="login-password"
                    className="text-sm font-medium text-white/85"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleForgotPassword}
                    className="text-xs font-medium text-[#C7B8F0] transition hover:text-[#6CCEB0] disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>

                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="ss-login-input mt-2.5 w-full rounded-xl border border-white/15 bg-[#0A2137]/65 px-4 py-3.5 text-sm text-white placeholder:text-white/40"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-300/25 bg-red-400/10 px-4 py-3 text-sm leading-5 text-red-200"
                >
                  {error}
                </div>
              )}

              {message && (
                <div
                  role="status"
                  className="mt-5 rounded-xl border border-[#6CCEB0]/25 bg-[#6CCEB0]/10 px-4 py-3 text-sm leading-5 text-[#B9F2DF]"
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="ss-login-button mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#544388] to-[#4D8AFF] px-4 py-3.5 text-sm font-medium text-white shadow-lg shadow-black/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Please wait..." : "Enter your dashboard"}
                {!loading && <span aria-hidden="true">↗</span>}
              </button>
            </form>

            <div className="my-7 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/15" />
              <span className="text-[10px] font-medium tracking-[0.16em] text-white/45">
                YOUR SPACE AWAITS
              </span>
              <div className="h-px flex-1 bg-white/15" />
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <span className="mt-0.5 text-sm text-[#6CCEB0]">✦</span>
              <p className="text-xs leading-5 text-white/65">
                Sign in securely with your StreamLounge account. Your
                creator tools are waiting on the other side.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-white/60">
            New to the platform?{" "}
            <Link
              href="/signup"
              className="font-medium text-white transition hover:text-[#6CCEB0]"
            >
              Create your account
            </Link>
          </p>

          <p className="mt-5 text-center text-[10px] tracking-[0.16em] text-white/40">
            STREAMLOUNGE <span className="mx-1.5">·</span> YOUR CREATOR SPACE
          </p>
        </div>
      </section>
    </main>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={<main className="auth-shell" aria-busy="true" />}>
      <LoginForm />
    </Suspense>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const features = [
  { icon: "✳", name: "Live chat", detail: "Messages become moments" },
  { icon: "◉", name: "Live audio", detail: "Let your audience be heard" },
  { icon: "⌘", name: "Soundboard", detail: "Trigger sounds in real time" },
  { icon: "✧", name: "Stickers", detail: "Add personality to streams" },
  { icon: "↗", name: "Spin wheel", detail: "Let the chat decide" },
  { icon: "◎", name: "Challenges", detail: "Turn viewers into players" },
];

export default function SignupClient() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [creatorName, setCreatorName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSignup() {
    if (loading) return;

    setError("");
    setSuccess("");

    if (!creatorName.trim()) {
      setError("Please enter your creator name.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { creator_name: creatorName.trim() },
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.user) {
        setSuccess(
          "Your account has been created. Check your email if verification is required."
        );

        setTimeout(() => router.push("/login"), 2500);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ss-new min-h-screen overflow-hidden text-slate-100">
      <div className="ss-new-atmosphere" aria-hidden="true">
        <div className="ss-new-glow ss-new-glow-a" />
        <div className="ss-new-glow ss-new-glow-b" />
        <div className="ss-new-grid" />
      </div>

      <header className="ss-new-nav">
        <Link href="/" className="ss-new-logo" aria-label="StreamLounge home">
          <span className="ss-new-logo-icon">ϟ</span>
          <span>Stream<span className="ss-new-muted-logo">Lounge</span></span>
        </Link>

        <div className="ss-new-nav-right">
          <span className="ss-new-nav-copy">Already have an account?</span>
          <Link href="/login" className="ss-new-login">
            Sign in <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      <section className="ss-new-layout">
        <div className="ss-new-intro">
          <div className="ss-new-status">
            <span className="ss-new-status-dot" />
            YOUR CREATOR ERA STARTS HERE
          </div>

          <p className="ss-new-overline">THE STREAMING EXPERIENCE, REIMAGINED</p>

          <h1>
            Make your
            <br />
            stream feel
            <br />
            <span className="ss-new-gradient">alive.</span>
          </h1>

          <p className="ss-new-description">
            Your community is more than an audience.
            Give them ways to play, react, participate
            and become part of the story.
          </p>

          <div className="ss-new-feature-heading">
            <span>YOUR CREATOR TOOLKIT</span>
            <span>06 MODULES</span>
          </div>

          <div className="ss-new-features">
            {features.map((feature, index) => (
              <div className="ss-new-feature" key={feature.name}>
                <div className="ss-new-feature-icon">{feature.icon}</div>
                <div className="ss-new-feature-copy">
                  <span>{feature.name}</span>
                  <small>{feature.detail}</small>
                </div>
                <span className="ss-new-feature-number">
                  0{index + 1}
                </span>
              </div>
            ))}
          </div>

          <div className="ss-new-footer-note">
            <span className="ss-new-footer-symbol">✳</span>
            <span>
              <strong>One stream. Endless possibilities.</strong>
              <small>Built for creators and the communities they build.</small>
            </span>
          </div>
        </div>

        <div className="ss-new-form-wrap">
          <div className="ss-new-form-topline">
            <span>STREAMLOUNGE / ACCOUNT SETUP</span>
            <span className="ss-new-step">STEP 01 / 02</span>
          </div>

          <div className="ss-new-card">
            <div className="ss-new-card-orb" aria-hidden="true" />

            <div className="ss-new-card-content">
              <div className="ss-new-card-symbol">ϟ</div>

              <p className="ss-new-kicker">YOUR SPACE. YOUR RULES.</p>

              <h2>Create your account<span>.</span></h2>

              <p className="ss-new-form-description">
                Start building a stream your community
                actually gets to be part of.
              </p>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSignup();
                }}
              >
                <div className="ss-new-field">
                  <label htmlFor="creator-name">CREATOR NAME</label>
                  <input
                    id="creator-name"
                    type="text"
                    autoComplete="nickname"
                    value={creatorName}
                    onChange={(event) => setCreatorName(event.target.value)}
                    placeholder="What should we call you?"
                    required
                  />
                </div>

                <div className="ss-new-field">
                  <label htmlFor="signup-email">EMAIL ADDRESS</label>
                  <input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="ss-new-field">
                  <label htmlFor="signup-password">PASSWORD</label>
                  <input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 6 characters"
                    required
                  />
                  <small className="ss-new-hint">
                    Use at least 6 characters.
                  </small>
                </div>

                {error && (
                  <div className="ss-new-message ss-new-error" role="alert">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="ss-new-message ss-new-success" role="status">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  className="ss-new-submit"
                  disabled={loading}
                >
                  <span>
                    {loading ? "Creating your account..." : "Create your account"}
                  </span>
                  <span className="ss-new-submit-arrow">↗</span>
                </button>
              </form>

              <div className="ss-new-divider">
                <span />
                <small>WHAT HAPPENS NEXT</small>
                <span />
              </div>

              <div className="ss-new-next">
                <div className="ss-new-next-icon">02</div>
                <div>
                  <strong>Connect your channel</strong>
                  <p>You can set up your YouTube connection after signup.</p>
                </div>
                <span className="ss-new-next-arrow">→</span>
              </div>

              <p className="ss-new-terms">
                By continuing, you agree to our{" "}
                <span>Terms</span> and <span>Privacy Policy</span>.
              </p>
            </div>
          </div>

          <p className="ss-new-bottom">
            Already part of the community?{" "}
            <Link href="/login">Sign in here</Link>
          </p>
        </div>
      </section>

      <div className="ss-new-page-index">
        <span>SS — 001</span>
        <span>CREATE SOMETHING THAT CONNECTS.</span>
      </div>

      <style jsx global>{`
      

/* Soft entrance animation */
@keyframes ss-soft-fade {
  from {
    opacity: 0;
    transform: translateY(12px);
    filter: blur(3px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

.ss-new {
  animation: ss-soft-fade 0.9s ease-out both;
}



  .ss-new-page,
  .ss-new-page .ss-new-copy,
  .ss-new-page .ss-new-card {
    animation: none;
  }
}

        .ss-new,
        .ss-new * {
          box-sizing: border-box;
          font-family: var(--font-geist-sans), Arial, sans-serif;
        }

        .ss-new {
          position: relative;
          isolation: isolate;
          background: #0a2137;
          color: #f8fafc;
        }

        .ss-new-atmosphere {
          position: absolute;
          inset: 0;
          z-index: -1;
          overflow: hidden;
          pointer-events: none;
          background:
            radial-gradient(ellipse at 19% 43%, rgba(124, 92, 196, .62), transparent 38%),
            radial-gradient(ellipse at 78% 80%, rgba(77, 138, 255, .13), transparent 35%),
            linear-gradient(125deg, #0a2137, #171c38 55%, #0a2137);
        }

        .ss-new-glow {
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 50%;
          filter: blur(110px);
          opacity: .42;
          animation: ss-new-drift 15s ease-in-out infinite alternate;
        }

        .ss-new-glow-a {
          top: 12%;
          left: -230px;
          background: #7c3aed;
        }

        .ss-new-glow-b {
          right: -280px;
          bottom: -100px;
          background: #315bb7;
          animation-delay: -6s;
        }

        .ss-new-grid {
          position: absolute;
          inset: 0;
          opacity: .13;
          background-image:
            linear-gradient(rgba(199, 210, 254, .12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(199, 210, 254, .12) 1px, transparent 1px);
          background-size: 52px 52px;
          mask-image: linear-gradient(to bottom, black, transparent 80%);
        }

        .ss-new-nav {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1440px;
          margin: auto;
          padding: 26px 5.5%;
          border-bottom: 1px solid rgba(199, 210, 254, .1);
        }

        .ss-new-logo {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: #f8fafc;
          text-decoration: none;
          font-size: 21px;
          font-weight: 750;
          letter-spacing: -.8px;
        }

        .ss-new-logo-icon {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border: 1px solid rgba(108, 206, 176, .35);
          border-radius: 11px;
          color: #6cceb0;
          background: rgba(108, 206, 176, .07);
          box-shadow: 0 0 24px rgba(108, 206, 176, .08);
        }

        .ss-new-muted-logo { color: #a78bfa; }

        .ss-new-nav-right {
          display: flex;
          align-items: center;
          gap: 20px;
          color: #94a3b8;
          font-size: 13px;
        }

        .ss-new-login {
          color: #6cceb0;
          text-decoration: none;
          font-weight: 650;
        }

        .ss-new-login span { margin-left: 5px; }

        .ss-new-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(360px, .8fr);
          align-items: center;
          gap: clamp(48px, 8vw, 125px);
          max-width: 1320px;
          min-height: calc(100vh - 125px);
          margin: auto;
          padding: 70px 6% 80px;
        }

        .ss-new-intro { max-width: 600px; }

        .ss-new-status {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 10px 13px;
          border: 1px solid rgba(108, 206, 176, .2);
          border-radius: 6px;
          background: rgba(108, 206, 176, .055);
          color: #9ae6d0;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.5px;
        }

        .ss-new-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #6cceb0;
          box-shadow: 0 0 12px #6cceb0;
        }

        .ss-new-overline {
          margin: 42px 0 17px;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 650;
          letter-spacing: 2.5px;
        }

        .ss-new-intro h1 {
          margin: 0;
          font-size: clamp(58px, 6.7vw, 91px);
          font-weight: 760;
          line-height: .98;
          letter-spacing: -.075em;
        }

        .ss-new-gradient {
          color: #a78bfa;
          background: linear-gradient(100deg, #a78bfa 5%, #c7d2fe 50%, #6cceb0 95%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .ss-new-description {
          max-width: 430px;
          margin: 25px 0 37px;
          color: #a4b2c7;
          font-size: 15px;
          line-height: 1.9;
        }

        .ss-new-feature-heading {
          display: flex;
          justify-content: space-between;
          max-width: 520px;
          padding-bottom: 13px;
          border-bottom: 1px solid rgba(199, 210, 254, .15);
          color: #a8b5ca;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.7px;
        }

        .ss-new-feature-heading span:last-child { color: #64748b; }

        .ss-new-features {
          display: grid;
          grid-template-columns: 1fr 1fr;
          max-width: 520px;
          column-gap: 22px;
        }

        .ss-new-feature {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px 0;
          border-bottom: 1px solid rgba(199, 210, 254, .09);
        }

        .ss-new-feature-icon {
          display: grid;
          place-items: center;
          width: 39px;
          height: 39px;
          flex-shrink: 0;
          border: 1px solid rgba(167, 139, 250, .22);
          border-radius: 11px;
          background: rgba(124, 58, 237, .1);
          color: #c7b5ff;
          font-size: 20px;
        }

        .ss-new-feature-copy {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 5px;
        }

        .ss-new-feature-copy span {
          color: #e2e8f0;
          font-size: 12px;
          font-weight: 650;
        }

        .ss-new-feature-copy small {
          color: #8291a9;
          font-size: 10px;
          line-height: 1.5;
        }

        .ss-new-feature-number {
          margin-left: auto;
          align-self: flex-start;
          color: #52647d;
          font-size: 9px;
        }

        .ss-new-footer-note {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-top: 29px;
        }

        .ss-new-footer-symbol {
          color: #6cceb0;
          font-size: 24px;
        }

        .ss-new-footer-note > span:last-child {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .ss-new-footer-note strong {
          color: #dce7f4;
          font-size: 11px;
          font-weight: 600;
        }

        .ss-new-footer-note small {
          color: #8291a9;
          font-size: 10px;
        }

        .ss-new-form-wrap { width: 100%; max-width: 460px; margin: auto; }

        .ss-new-form-topline {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
          color: #8291a9;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.3px;
        }

        .ss-new-step { color: #a78bfa; }

        .ss-new-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(199, 210, 254, .18);
          border-radius: 19px;
          background: linear-gradient(145deg, rgba(19, 32, 58, .95), rgba(10, 21, 42, .97));
          box-shadow: 0 35px 100px rgba(0, 0, 0, .28), 0 0 65px rgba(124, 58, 237, .07);
        }

        .ss-new-card-orb {
          position: absolute;
          top: -130px;
          right: -100px;
          width: 250px;
          height: 250px;
          border-radius: 50%;
          background: rgba(124, 58, 237, .17);
          filter: blur(65px);
          pointer-events: none;
        }

        .ss-new-card-content {
          position: relative;
          padding: 34px clamp(23px, 3vw, 38px) 27px;
        }

        .ss-new-card-symbol {
          display: grid;
          place-items: center;
          width: 45px;
          height: 45px;
          border: 1px solid rgba(108, 206, 176, .32);
          border-radius: 13px;
          background: rgba(108, 206, 176, .08);
          color: #6cceb0;
          font-size: 23px;
        }

        .ss-new-kicker {
          margin: 25px 0 10px;
          color: #6cceb0;
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 2px;
        }

        .ss-new-card h2 {
          margin: 0;
          color: #f8fafc;
          font-size: clamp(27px, 3vw, 34px);
          font-weight: 700;
          letter-spacing: -1.6px;
        }

        .ss-new-card h2 span { color: #6cceb0; }

        .ss-new-form-description {
          margin: 12px 0 28px;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.8;
        }

        .ss-new-field { margin-top: 19px; }

        .ss-new-field label {
          display: block;
          margin-bottom: 9px;
          color: #c7d2e1;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.3px;
        }

        .ss-new-field input {
          display: block;
          width: 100%;
          min-height: 48px;
          border: 1px solid rgba(148, 163, 184, .19);
          border-radius: 9px;
          outline: none;
          background: rgba(5, 14, 30, .58);
          padding: 13px 14px;
          color: #f8fafc;
          font-size: 12px;
          transition: border-color .2s, box-shadow .2s, background .2s;
        }

        .ss-new-field input::placeholder { color: #61718a; }

        .ss-new-field input:focus {
          border-color: rgba(108, 206, 176, .72);
          background: rgba(5, 14, 30, .85);
          box-shadow: 0 0 0 3px rgba(108, 206, 176, .07);
        }

        .ss-new-hint {
          display: block;
          margin-top: 8px;
          color: #71819a;
          font-size: 10px;
        }

        .ss-new-submit {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          min-height: 52px;
          margin-top: 25px;
          border: 1px solid rgba(167, 139, 250, .45);
          border-radius: 9px;
          background: linear-gradient(105deg, #6cceb0, #8adbc4 58%, #b0a0ff 130%);
          padding: 0 17px;
          color: #091a2b;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
          transition: transform .2s, box-shadow .2s, filter .2s;
        }

        .ss-new-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 35px rgba(108, 206, 176, .18);
          filter: brightness(1.04);
        }

        .ss-new-submit:disabled { cursor: wait; opacity: .65; }

        .ss-new-submit-arrow {
          display: grid;
          place-items: center;
          width: 27px;
          height: 27px;
          border-radius: 7px;
          background: rgba(10, 33, 55, .12);
          font-size: 16px;
        }

        .ss-new-message {
          margin-top: 15px;
          border: 1px solid;
          border-radius: 9px;
          padding: 12px;
          font-size: 11px;
          line-height: 1.6;
        }

        .ss-new-error {
          border-color: rgba(248, 113, 113, .3);
          background: rgba(239, 68, 68, .08);
          color: #fca5a5;
        }

        .ss-new-success {
          border-color: rgba(108, 206, 176, .3);
          background: rgba(108, 206, 176, .08);
          color: #9ae6d0;
        }

        .ss-new-divider {
          display: flex;
          align-items: center;
          gap: 11px;
          margin: 27px 0 19px;
        }

        .ss-new-divider span {
          height: 1px;
          flex: 1;
          background: rgba(199, 210, 254, .12);
        }

        .ss-new-divider small {
          color: #71819a;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 1.5px;
        }

        .ss-new-next {
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid rgba(199, 210, 254, .1);
          border-radius: 10px;
          background: rgba(255, 255, 255, .025);
          padding: 13px;
        }

        .ss-new-next-icon {
          display: grid;
          place-items: center;
          width: 35px;
          height: 35px;
          flex-shrink: 0;
          border-radius: 9px;
          background: rgba(167, 139, 250, .12);
          color: #c4b5fd;
          font-size: 10px;
          font-weight: 700;
        }

        .ss-new-next > div:nth-child(2) { min-width: 0; flex: 1; }

        .ss-new-next strong {
          color: #dce7f4;
          font-size: 11px;
          font-weight: 650;
        }

        .ss-new-next p {
          margin: 5px 0 0;
          color: #8291a9;
          font-size: 10px;
          line-height: 1.6;
        }

        .ss-new-next-arrow { color: #6cceb0; }

        .ss-new-terms {
          margin: 22px 0 0;
          color: #71819a;
          font-size: 10px;
          line-height: 1.8;
          text-align: center;
        }

        .ss-new-terms span { color: #c4b5fd; }

        .ss-new-bottom {
          margin: 20px 0 0;
          color: #8291a9;
          font-size: 11px;
          text-align: center;
        }

        .ss-new-bottom a {
          color: #6cceb0;
          font-weight: 650;
          text-decoration: none;
        }

        .ss-new-bottom a:hover,
        .ss-new-login:hover { text-decoration: underline; }

        .ss-new-page-index {
          display: flex;
          justify-content: space-between;
          max-width: 1320px;
          margin: auto;
          padding: 0 6% 23px;
          color: #52647d;
          font-size: 8px;
          font-weight: 650;
          letter-spacing: 1.6px;
        }

        @keyframes ss-new-drift {
          from { transform: translate3d(0, -15px, 0) scale(.94); }
          to { transform: translate3d(45px, 30px, 0) scale(1.08); }
        }

        @media (max-width: 950px) {
          .ss-new-layout {
            grid-template-columns: 1fr;
            gap: 48px;
            max-width: 600px;
            padding-top: 52px;
          }

          .ss-new-intro { max-width: 100%; }
          .ss-new-intro h1 { font-size: clamp(54px, 12vw, 76px); }
          .ss-new-overline { margin-top: 30px; }
          .ss-new-description { margin-bottom: 28px; }
          .ss-new-form-wrap { max-width: 500px; }
          .ss-new-page-index { padding-right: 5%; padding-left: 5%; }
        }

        @media (max-width: 520px) {
          .ss-new-nav { padding: 18px 5%; }
          .ss-new-logo { font-size: 18px; }
          .ss-new-nav-right { gap: 10px; font-size: 11px; }
          .ss-new-nav-copy { display: none; }
          .ss-new-layout { padding: 37px 5% 48px; }
          .ss-new-intro h1 { font-size: 55px; }
          .ss-new-overline { font-size: 8px; letter-spacing: 1.5px; }
          .ss-new-features { column-gap: 13px; }
          .ss-new-feature { gap: 9px; }
          .ss-new-feature-icon { width: 34px; height: 34px; }
          .ss-new-feature-copy small { font-size: 9px; }
          .ss-new-card-content { padding: 27px 21px 23px; }
          .ss-new-card h2 { font-size: 29px; }
          .ss-new-page-index { gap: 12px; font-size: 7px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ss-new-glow { animation: none; }
          .ss-new-submit { transition: none; }
        }
      `}</style>
    </main>
  );
}

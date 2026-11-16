
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const features = [
  { icon: "💬", title: "Text to Speech", description: "Turn viewer messages into part of the show with interactive text and voice." },
  { icon: "🎙️", title: "Voice Messages", description: "Let your community become part of the action with audio interactions." },
  { icon: "🔊", title: "Soundboard", description: "Bring unexpected sounds and memorable moments straight into your stream." },
  { icon: "✦", title: "Stickers", description: "Give your audience a visual way to react and make their presence felt." },
  { icon: "◉", title: "Spin the Wheel", description: "Add an element of chance and let your viewers influence what happens next." },
  { icon: "🎯", title: "Live Challenges", description: "Turn ordinary gameplay into a shared experience with viewer-triggered tasks." },
];

const questions = [
  {
    q: "What is StreamLounge?",
    a: "StreamLounge is an interactive platform designed to help creators make their live streams more engaging through viewer-powered experiences.",
  },
  {
    q: "Do my viewers need an account?",
    a: "The experience is designed to let viewers participate through a unique link or QR code, without requiring a viewer account.",
  },
  {
    q: "Can I use StreamLounge with OBS?",
    a: "StreamLounge is designed with OBS-compatible streaming workflows in mind. Available integrations depend on the features configured in your project.",
  },
];

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  
  
useEffect(() => {
  const elements = document.querySelectorAll(
    ".ss-scroll-reveal"
  );

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("ss-scroll-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: "0px 0px -30px 0px",
    }
  );

  elements.forEach((element) => {
    observer.observe(element);
  });

  return () => observer.disconnect();
},
 []);


  return (
    <main className="ss-page min-h-screen overflow-hidden text-white">
      {/* NAVIGATION */}
      <nav className="ss-nav sticky top-0 z-50 border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="ss-logo text-2xl font-semibold tracking-tight">
            <span className="ss-mint">ϟ</span> Stream<span className="ss-lilac">Lounge</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm text-white/65 md:flex">
            <a href="#home" className="transition hover:text-white">Home</a>
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#for-creators" className="transition hover:text-white">For Creators</a>
            <a href="#pricing" className="transition hover:text-white">Pricing</a>
            <a href="#faq" className="transition hover:text-white">FAQ</a>
          </div>

          <Link href="/login" className="ss-button-secondary rounded-full px-5 py-2.5 text-sm font-medium">
            Log in <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section id="home" className="ss-hero relative">
        <div className="ss-orb ss-orb-one" />
        <div className="ss-orb ss-orb-two" />

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-16 px-6 py-24 md:min-h-[690px] md:grid-cols-[1.1fr_0.9fr] md:py-28">
          <div className="ss-reveal">
            <div className="ss-pill mb-8 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm">
              <span className="ss-status-dot" />
              Made for the next generation of creators
            </div>

            <h1 className="max-w-3xl text-5xl font-medium leading-[1.06] tracking-[-0.055em] sm:text-6xl md:text-7xl lg:text-[82px]">
              Your stream.
              <br />
              Their <span className="ss-gradient-text">world.</span>
            </h1>

            <p className="mt-7 max-w-xl text-base leading-8 text-white/60 md:text-lg">
              Turn passive viewers into active participants. Bring your
              community into the action and make every stream feel different.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link href="/signup" className="ss-button-primary rounded-full px-7 py-4 font-semibold">
                Start creating <span className="ml-2">↗</span>
              </Link>
              <a href="#features" className="ss-button-secondary rounded-full px-7 py-4 font-medium">
                Explore the experience <span className="ml-2">↓</span>
              </a>
            </div>

            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/55">
              <span><span className="ss-mint mr-2">✓</span>Viewer-friendly access</span>
              <span><span className="ss-mint mr-2">✓</span>Unique links & QR codes</span>
              <span><span className="ss-mint mr-2">✓</span>OBS-focused workflow</span>
            </div>
          </div>

          {/* INTERACTIVE-STYLE STREAM PREVIEW */}
          <div className="ss-reveal ss-reveal-delay relative">
            <div className="ss-preview-glow" />

            <div className="ss-preview relative">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="ss-avatar">S</span>
                  <div>
                    <p className="text-sm font-medium">Your stream, reimagined</p>
                    <p className="text-xs text-white/45">Community control center</p>
                  </div>
                </div>
                <span className="ss-live rounded-full px-3 py-1 text-xs font-medium">
                  <span className="mr-1.5">●</span> LIVE
                </span>
              </div>

              <div className="ss-preview-screen m-4 rounded-2xl p-5 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="text-xs tracking-[0.2em] text-white/55">LIVE EXPERIENCE</span>
                  <span className="text-xs text-white/55">STREAM_001</span>
                </div>

                <div className="ss-visualizer my-8 flex h-24 items-center justify-center gap-1.5">
                  {Array.from({ length: 31 }, (_, i) => (
                    <span
                      key={i}
                      className="ss-wave"
                      style={{
                        height: `${15 + ((i * 17 + 11) % 75)}%`,
                        animationDelay: `${(i % 8) * -0.17}s`,
                      }}
                    />
                  ))}
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-2xl font-medium tracking-tight">You&apos;re in control.</p>
                    <p className="mt-1 text-sm text-white/50">Your audience makes the moment.</p>
                  </div>
                  <span className="ss-mint text-2xl">↗</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 px-4 pb-4">
                {[
                  ["💬", "Messages"],
                  ["🎙️", "Voice"],
                  ["🎡", "Challenges"],
                ].map(([icon, label]) => (
                  <div key={label} className="ss-mini-card rounded-xl p-3 text-center">
                    <span className="block text-xl">{icon}</span>
                    <span className="mt-2 block text-xs text-white/65">{label}</span>
                  </div>
                ))}
              </div>

              <div className="ss-preview-bottom flex items-center justify-between px-5 py-3 text-xs text-white/45">
                <span>CREATOR DASHBOARD</span>
                <span className="ss-mint">Built around interaction</span>
              </div>
            </div>

            <div className="ss-float-tag ss-float-top">✦ More interaction</div>
            <div className="ss-float-tag ss-float-bottom">↗ Made for your community</div>
          </div>
        </div>

        <div className="ss-marquee border-y border-white/[0.08] py-4">
          <div className="ss-marquee-track">
            {Array.from({ length: 2 }, (_, group) => (
              <div className="flex shrink-0 items-center gap-8 px-4" key={group}>
                {["TEXT", "AUDIO", "SOUNDBOARD", "STICKERS", "SPIN THE WHEEL", "LIVE TASKS"].map((item) => (
                  <span key={item} className="flex items-center gap-8 text-xs font-medium tracking-[0.22em] text-white/45">
                    {item}<span className="ss-mint text-base">✳</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="ss-section ss-scroll-reveal px-6 py-24 md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="ss-section-heading mb-14 grid gap-5 md:grid-cols-2 md:items-end">
            <div>
              <p className="ss-eyebrow">01 / THE EXPERIENCE</p>
              <h2 className="mt-5 max-w-2xl text-4xl font-medium leading-tight tracking-[-0.04em] sm:text-5xl md:text-6xl">
                More than a stream.
                <br />
                <span className="ss-muted-heading">A shared experience.</span>
              </h2>
            </div>
            <p className="max-w-lg leading-7 text-white/55 md:justify-self-end">
              Every interaction gives your audience a reason to stay,
              participate, and become part of the story.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <article key={feature.title} className="ss-feature-card ss-scroll-reveal group rounded-2xl p-7">
                <div className="flex items-start justify-between">
                  <span className="ss-feature-icon flex h-12 w-12 items-center justify-center rounded-xl text-2xl">
                    {feature.icon}
                  </span>
                  <span className="text-sm text-white/25 transition group-hover:text-[#6CCEB0]">
                    0{i + 1} ↗
                  </span>
                </div>

                <h3 className="mt-8 text-xl font-medium tracking-tight">{feature.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/50">{feature.description}</p>

                <div className="ss-card-line mt-7 h-px w-full" />
                <p className="mt-4 text-xs tracking-wide text-white/40">
                  MADE FOR PARTICIPATION
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FOR CREATORS */}
      <section id="for-creators"className="ss-section ss-scroll-reveal">
        <div className="mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2">
          <div>
            <p className="ss-eyebrow">02 / YOUR COMMUNITY</p>
            <h2 className="mt-5 text-4xl font-medium leading-tight tracking-[-0.04em] sm:text-5xl md:text-6xl">
              Give viewers
              <br />
              a seat in the show.
            </h2>
            <p className="mt-6 max-w-xl leading-8 text-white/55">
              Your community should do more than watch. Give them new ways
              to shape moments, spark reactions, and participate in your content.
            </p>
            <Link href="/signup" className="ss-button-primary mt-8 inline-flex rounded-full px-7 py-4 font-semibold">
              Build your experience <span className="ml-2">↗</span>
            </Link>
          </div>

          <div className="ss-community-panel ss-community rounded-3xl p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-medium">Community activity</p>
                <p className="mt-1 text-xs text-white/45">A glimpse of the experience</p>
              </div>
              <span className="ss-status-dot" />
            </div>

            {[
              ["A", "Alex", "Sent a message", "💬"],
              ["M", "Morgan", "Triggered a sound", "🔊"],
              ["J", "Jamie", "Started a challenge", "🎯"],
              ["R", "Riley", "Dropped a sticker", "✦"],
            ].map(([initial, name, action, icon], i) => (
              <div key={name} className="ss-activity-row flex items-center gap-4 py-5" style={{ animationDelay: `${i * 0.12}s` }}>
                <span className="ss-avatar">{initial}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{name}</p>
                  <p className="mt-1 text-xs text-white/45">{action}</p>
                </div>
                <span className="text-xl">{icon}</span>
              </div>
            ))}

            <div className="ss-activity-note mt-2 rounded-xl p-4 text-sm text-white/65">
              <span className="ss-mint mr-2">✳</span>
              Every viewer can bring a new moment.
            </div>
          </div>
        </div>
      </section>
     <section id="faq" className="ss-section ss-scroll-reveal mt-24">
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="ss-eyebrow">03 / QUESTIONS</p>
            <h2 className="mt-5 text-4xl font-medium tracking-[-0.04em] sm:text-5xl">
              A few things
              <br />
              worth knowing.
            </h2>
            <p className="mt-5 max-w-sm leading-7 text-white/50">
              Everything you need to know before getting started.
            </p>
          </div>

          <div>
            {questions.map((item, i) => (
              <div key={item.q} className="border-b border-white/10">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-5 py-6 text-left"
                  aria-expanded={openFaq === i}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="text-base font-medium sm:text-lg">{item.q}</span>
                  <span className={`ss-faq-icon ${openFaq === i ? "is-open" : ""}`}>+</span>
                </button>

                <div className={`ss-faq-answer ${openFaq === i ? "is-open" : ""}`}>
                  <p className="pb-6 pr-8 text-sm leading-7 text-white/55">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-6 py-20">
        <div className="ss-final-cta mx-auto max-w-7xl rounded-3xl px-6 py-16 text-center sm:px-12 md:py-20">
          <p className="ss-eyebrow">YOUR STREAM, YOUR RULES</p>
          <h2 className="mx-auto mt-5 max-w-3xl text-4xl font-medium tracking-[-0.045em] sm:text-5xl md:text-6xl">
            Make the audience
            <br />
            part of the action.
          </h2>
          <Link href="/signup" className="ss-button-primary mt-8 inline-flex rounded-full px-8 py-4 font-semibold">
            Join StreamLounge <span className="ml-2">↗</span>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="ss-logo text-xl font-semibold">
            <span className="ss-mint">ϟ</span> Stream<span className="ss-lilac">Lounge</span>
          </Link>

          <p className="text-sm text-white/40">
            Sync your stream. Amplify every moment.
          </p>

          <div className="flex gap-5 text-sm text-white/50">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#faq" className="transition hover:text-white">FAQ</a>
            <Link href="/login" className="transition hover:text-white">Login</Link>
          </div>
        </div>
        <p className="mx-auto mt-7 max-w-7xl text-xs text-white/30">
          © {new Date().getFullYear()} StreamLounge. All rights reserved.
        </p>
      </footer>
    </main>
  );
}

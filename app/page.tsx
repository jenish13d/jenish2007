import Link from "next/link";

import { INTERACTION_DEFINITIONS } from "@/lib/interactions/registry";

/**
 * Landing page.
 *
 * A Server Component: it is entirely static marketing content, so there is no
 * reason to ship it to the browser as JavaScript. The original was a client
 * component carrying scroll and hover state for decorative effects, which meant
 * every first-time visitor downloaded and hydrated it before reading a word.
 *
 * Copy, section order and the product's voice are carried over from the
 * original.
 */

const FEATURES = [
  {
    kicker: "Text & voice",
    title: "Turn viewer messages into part of the show",
    body: "Turn viewer messages into part of the show with interactive text and voice.",
  },
  {
    kicker: "Soundboard",
    title: "Sounds your community triggers",
    body: "Bring unexpected sounds and memorable moments straight into your stream.",
  },
  {
    kicker: "Stickers",
    title: "A visual way to react",
    body: "Give your audience a visual way to react and make their presence felt.",
  },
  {
    kicker: "Spin wheel",
    title: "Add an element of chance",
    body: "Add an element of chance and let your viewers influence what happens next.",
  },
  {
    kicker: "Tasks",
    title: "Viewer-triggered challenges",
    body: "Turn ordinary gameplay into a shared experience with viewer-triggered tasks.",
  },
  {
    kicker: "Audio",
    title: "Let your community into the action",
    body: "Let your community become part of the action with audio interactions.",
  },
] as const;

const FAQS = [
  {
    question: "What is StreamLounge?",
    answer:
      "StreamLounge is an interactive platform designed to help creators make their live streams more engaging through viewer-powered experiences.",
  },
  {
    question: "Do my viewers need an account?",
    answer:
      "The experience is designed to let viewers participate through a unique link or QR code, without requiring a viewer account.",
  },
  {
    question: "Can I use StreamLounge with OBS?",
    answer:
      "StreamLounge is designed with OBS-compatible streaming workflows in mind. You add a single browser source and your alerts appear on stream.",
  },
] as const;

const ACTIVITY = [
  { who: "Aarav", what: "Triggered a sound" },
  { who: "Meera", what: "Dropped a sticker" },
  { who: "Kabir", what: "Started a challenge" },
] as const;

export default function HomePage() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link href="/" className="landing-brand" aria-label="StreamLounge home">
          <span className="landing-brand-strong">Stream</span>
          <span className="landing-brand-light">Lounge</span>
        </Link>

        <nav className="landing-nav-links" aria-label="Main">
          <a href="#features">Features</a>
          <a href="#creators">For Creators</a>
          <a href="#faq">Questions</a>
        </nav>

        <div className="landing-nav-actions">
          <Link href="/login" className="btn-ghost">
            Login
          </Link>
          <Link href="/signup" className="btn-primary">
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <p className="landing-eyebrow">
          <span className="live-dot" aria-hidden="true" />
          Live experience
        </p>
        <h1>
          Your stream, reimagined.
          <br />
          <span className="landing-hero-accent">
            Your audience makes the moment.
          </span>
        </h1>
        <p className="landing-lede">
          Viewers send messages, voice notes, sounds, stickers, spins and
          challenges. Each one appears on your stream through a single OBS
          browser source. You stay in control of what is on offer and what it
          costs.
        </p>
        <div className="landing-hero-actions">
          <Link href="/signup" className="btn-primary btn-lg">
            Create your page
          </Link>
          <a href="#features" className="btn-ghost btn-lg">
            See how it works
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="landing-section">
        <p className="landing-section-index">01 / The experience</p>
        <h2>A shared experience.</h2>
        <div className="landing-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="landing-card">
              <p className="landing-card-kicker">{feature.kicker}</p>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* For creators */}
      <section id="creators" className="landing-section">
        <p className="landing-section-index">02 / Your community</p>
        <h2>Built around interaction</h2>

        <div className="landing-split">
          <div>
            <ul className="landing-checklist">
              <li>
                <strong>Viewer-friendly access.</strong> Viewers join through a
                link or QR code. No account, no download.
              </li>
              <li>
                <strong>Unique links &amp; QR codes.</strong> One page per
                creator, ready to drop in a stream panel or a video description.
              </li>
              <li>
                <strong>OBS-focused workflow.</strong> One browser source, six
                alert themes, and a key you can rotate if you ever show the URL
                on stream.
              </li>
              <li>
                <strong>Community control center.</strong> Decide which
                interactions are on, set your own prices, and curate your
                soundboard.
              </li>
            </ul>
          </div>

          <aside className="landing-activity" aria-label="Example community activity">
            <p className="landing-activity-title">Community activity</p>
            <ul>
              {ACTIVITY.map((item) => (
                <li key={item.who}>
                  <span className="landing-activity-who">{item.who}</span>
                  <span className="landing-activity-what">{item.what}</span>
                </li>
              ))}
            </ul>
            <p className="landing-activity-foot">A glimpse of the experience</p>
          </aside>
        </div>
      </section>

      {/* Interaction catalogue — generated from the registry so the marketing
          page cannot drift out of step with what the product actually offers. */}
      <section className="landing-section">
        <h2>What viewers can send</h2>
        <div className="landing-pills">
          {Object.values(INTERACTION_DEFINITIONS).map((definition) => (
            <div key={definition.type} className="landing-pill">
              <strong>{definition.label}</strong>
              <span>{definition.description}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="landing-section">
        <p className="landing-section-index">03 / Questions</p>
        <h2>Your stream, your rules</h2>
        <div className="landing-faq">
          {FAQS.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <p>
          <span className="landing-brand-strong">Stream</span>
          <span className="landing-brand-light">Lounge</span>
        </p>
        <p className="landing-footer-note">
          Built for creators and the communities that show up for them.
        </p>
      </footer>
    </main>
  );
}

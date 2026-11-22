import Link from "next/link";

import { MarketingPage, Sculpture } from "@/app/component/marketing/Chrome";
import { FeeCards } from "@/app/component/marketing/FeeCards";
import { Icon, type IconName } from "@/app/component/ui/icons";

/**
 * Public homepage. Server-rendered, no client JavaScript beyond Next's router.
 * Everything stated here is something the product actually does; there are no
 * user counts, testimonials or certifications.
 */

const CAPABILITIES: { n: string; title: string; body: string }[] = [
  { n: "01", title: "On-screen QR superchats", body: "Viewers scan the code on your stream, pick an amount and send a message. No viewer account required." },
  { n: "02", title: "Alerts, read aloud", body: "Paid messages appear on stream and are announced by the StreamLounge voice, with an emergency mute one click away." },
  { n: "03", title: "Overlays that stay out of the way", body: "Alerts, a ticker and a QR panel as browser sources for OBS and Streamlabs. Private URLs you can revoke." },
  { n: "04", title: "Earnings you can audit", body: "Every rupee recorded once, on an append-only ledger, with refunds, disputes and payouts reconciled against it." },
];

const STEPS: { title: string; body: string }[] = [
  { title: "Set up your page", body: "Choose a username, prices and message length. Your page lives at streamlounge/c/you." },
  { title: "Add the overlay", body: "Paste one browser-source URL into OBS or Streamlabs. The QR code, alerts and ticker run from it." },
  { title: "Go live anywhere", body: "Stream to YouTube, Twitch or Kick as usual. Viewers scan, pay and appear on stream within seconds." },
];

const TRUST: { icon: IconName; title: string; body: string }[] = [
  { icon: "shield", title: "Payments verified on the server", body: "Every payment is confirmed with Razorpay before an alert plays or a rupee is credited. Amounts and fees are never taken from the browser." },
  { icon: "lock", title: "An append-only ledger", body: "Money movements are written once and never edited. Corrections are new, audited entries with a reason attached." },
  { icon: "link", title: "Private, revocable overlay URLs", body: "Your browser-source link carries a secret key. Rotate it any time and the old one stops working immediately." },
  { icon: "eye", title: "Your supporters stay private", body: "Supporters choose the name shown on stream. Their account details are never shown to creators or other viewers." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What does StreamLounge charge?",
    a: "8% of each superchat paid through your StreamLounge QR code or page. On a ₹1,000 superchat that is ₹80, and your share is ₹920. Payment gateway charges and applicable taxes are shown separately in your finance reports.",
  },
  {
    q: "Can I use my own Razorpay payment link?",
    a: "Yes. Put your own Razorpay link in your YouTube or Twitch description and StreamLounge takes no commission on those payments: they go straight to your Razorpay account. Razorpay's own charges still apply on your account.",
  },
  {
    q: "Does it work on YouTube?",
    a: "Yes. StreamLounge runs as a browser source in OBS or Streamlabs, so it works with whatever platform you stream to, including YouTube, Twitch and Kick. No YouTube account connection is needed.",
  },
  {
    q: "Do my viewers need an account?",
    a: "No. Viewers can pay with UPI, cards and other Razorpay methods without signing up. An optional supporter account keeps their history and LoungePoints in one place.",
  },
  {
    q: "When can I withdraw?",
    a: "Earnings become available after a short settlement hold, shown in your Finance page. Withdrawals are enabled once payouts are switched on for your account.",
  },
];

export default function Home() {
  return (
    <MarketingPage>
      {/* ---------------------------------------------------------- hero */}
      <section className="sl-grain relative -mt-20 overflow-hidden pt-20">
        <Sculpture className="sl-hero-sculpture pointer-events-none absolute inset-0 h-full w-full" />
        <div className="relative z-[2] mx-auto max-w-[1320px] px-5 pb-20 pt-16 md:px-10 md:pb-28 md:pt-28">
          <p className="sl-kicker sl-kicker-rule sl-in">Creator monetization for live streams</p>
          <h1 className="sl-display sl-in mt-8" style={{ ["--d" as string]: 80 }}>
            Your stream.
            <br />
            <span className="sl-outline">Your community.</span>
            <br />
            Your earnings.
          </h1>
          <div className="mt-16 grid items-end gap-10 md:mt-24 md:grid-cols-[minmax(0,420px)_1fr]">
            <div className="sl-in" style={{ ["--d" as string]: 160 }}>
              <p className="sl-lead">
                StreamLounge turns your audience&apos;s support into on-screen moments: QR superchats, messages read aloud and
                overlays for OBS and Streamlabs, with earnings you can trace to the rupee.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="sl-btn sl-btn-primary sl-btn-lg sl-btn-mono">Get started</Link>
                <Link href="/pricing" className="sl-btn sl-btn-lg">See the fees</Link>
              </div>
            </div>
            <p className="sl-kicker justify-self-start md:justify-self-end">
              Works with OBS · Streamlabs · StreamYard · YouTube · Twitch · Kick
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- capabilities */}
      <section id="product" className="border-t" style={{ borderColor: "var(--sl-line)" }}>
        <div className="mx-auto max-w-[1320px] px-5 py-24 md:px-10">
          <div className="grid gap-12 md:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="sl-kicker sl-kicker-rule">The product</p>
              <h2 className="sl-h1 mt-6 max-w-md">Built for the moment a viewer decides to support you.</h2>
            </div>
            <ol className="grid gap-px overflow-hidden rounded-[14px] border sm:grid-cols-2" style={{ borderColor: "var(--sl-line)", background: "var(--sl-line)" }}>
              {CAPABILITIES.map((c) => (
                <li key={c.n} className="p-7" style={{ background: "var(--sl-bg)" }}>
                  <span className="sl-mono text-[12px]" style={{ color: "var(--sl-accent)" }}>{c.n}</span>
                  <h3 className="mt-6 text-[17px] font-medium tracking-[-0.02em]">{c.title}</h3>
                  <p className="sl-body sl-muted mt-2.5">{c.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ studio preview */}
      <section className="relative overflow-hidden border-t" style={{ borderColor: "var(--sl-line)" }}>
        <div className="mx-auto max-w-[1320px] px-5 py-24 md:px-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="sl-kicker sl-kicker-rule">Creator studio</p>
              <h2 className="sl-h1 mt-6 max-w-xl">One place for superchats, overlays and money.</h2>
            </div>
            <p className="sl-body sl-muted max-w-sm">Arrange the overview the way you work. Hide what you don&apos;t use, keep what you check every stream.</p>
          </div>
          <StudioPreview />
          <p className="sl-faint mt-3 text-[12px]">Illustration with example figures.</p>
        </div>
      </section>

      {/* -------------------------------------------------- how it works */}
      <section id="how" className="border-t" style={{ borderColor: "var(--sl-line)" }}>
        <div className="mx-auto max-w-[1320px] px-5 py-24 md:px-10">
          <p className="sl-kicker sl-kicker-rule">How it works</p>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="border-t pt-6" style={{ borderColor: "var(--sl-line-2)" }}>
                <span className="sl-mono text-[12px] sl-muted">Step {i + 1}</span>
                <h3 className="sl-h2 mt-4">{s.title}</h3>
                <p className="sl-body sl-muted mt-3 max-w-sm">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- fees */}
      <section className="border-t" style={{ borderColor: "var(--sl-line)" }}>
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-24 md:grid-cols-[1fr_1.4fr] md:px-10">
          <div>
            <p className="sl-kicker sl-kicker-rule">Fees</p>
            <h2 className="sl-h1 mt-6">Two channels. One clear rule.</h2>
            <p className="sl-body sl-muted mt-5 max-w-sm">
              We earn when the StreamLounge QR earns for you. Payments through your own Razorpay link are yours entirely.
            </p>
            <Link href="/pricing" className="sl-btn mt-8">Read the fee policy <Icon name="arrowRight" size={14} /></Link>
          </div>
          <FeeCards />
        </div>
      </section>

      {/* --------------------------------------------------------- trust */}
      <section className="border-t" style={{ borderColor: "var(--sl-line)" }}>
        <div className="mx-auto max-w-[1320px] px-5 py-24 md:px-10">
          <p className="sl-kicker sl-kicker-rule">How we handle money</p>
          <div className="mt-10 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t) => (
              <div key={t.title}>
                <span className="grid h-9 w-9 place-items-center rounded-md border" style={{ borderColor: "var(--sl-line-2)", color: "var(--sl-accent)" }}>
                  <Icon name={t.icon} />
                </span>
                <h3 className="mt-5 text-[15px] font-medium">{t.title}</h3>
                <p className="sl-body sl-muted mt-2">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- faq */}
      <section className="border-t" style={{ borderColor: "var(--sl-line)" }}>
        <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-24 md:grid-cols-[1fr_1.6fr] md:px-10">
          <div>
            <p className="sl-kicker sl-kicker-rule">Questions</p>
            <h2 className="sl-h1 mt-6">Straight answers.</h2>
          </div>
          <div className="border-t" style={{ borderColor: "var(--sl-line)" }}>
            {FAQ.map((f) => (
              <details key={f.q} className="sl-faq group border-b" style={{ borderColor: "var(--sl-line)" }}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15.5px] font-medium">
                  {f.q}
                  <span className="sl-muted transition group-open:rotate-45"><Icon name="plus" /></span>
                </summary>
                <p className="sl-body sl-muted max-w-2xl pb-6">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- cta */}
      <section className="sl-grain relative overflow-hidden border-t" style={{ borderColor: "var(--sl-line)" }}>
        <div className="relative z-[2] mx-auto flex max-w-[1320px] flex-col items-start gap-8 px-5 py-28 md:flex-row md:items-end md:justify-between md:px-10">
          <h2 className="sl-display !text-[clamp(40px,6vw,84px)]">
            Go live.
            <br />
            <span className="sl-outline">Get supported.</span>
          </h2>
          <Link href="/signup" className="sl-btn sl-btn-primary sl-btn-lg sl-btn-mono">Create your page</Link>
        </div>
      </section>
    </MarketingPage>
  );
}

/** A static, illustrative rendering of the creator overview. */
function StudioPreview() {
  const bars = [38, 52, 44, 61, 57, 72, 66, 84, 78, 92, 70, 88];
  return (
    <div className="mt-12 overflow-hidden rounded-[16px] border" style={{ borderColor: "var(--sl-line-2)", background: "var(--sl-bg-1)" }} aria-hidden="true">
      <div className="flex h-10 items-center gap-1.5 border-b px-4" style={{ borderColor: "var(--sl-line)" }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--sl-surface-3)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--sl-surface-3)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--sl-surface-3)" }} />
        <span className="sl-kicker ml-4 !text-[10px]">Studio · Overview</span>
      </div>
      <div className="grid gap-px md:grid-cols-[200px_1fr]" style={{ background: "var(--sl-line)" }}>
        <div className="hidden space-y-1 p-4 md:block" style={{ background: "var(--sl-bg)" }}>
          {["Overview", "Superchats", "Manage Interactions", "Stream Setup", "Customization", "Finance", "Settings"].map((n, i) => (
            <div key={n} className="rounded-md px-3 py-2 text-[12.5px]" style={i === 0 ? { background: "var(--sl-surface-2)", color: "var(--sl-fg)" } : { color: "var(--sl-muted)" }}>{n}</div>
          ))}
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-3" style={{ background: "var(--sl-bg)" }}>
          {[["Today", "₹4,280"], ["This month", "₹58,940"], ["Available", "₹41,212"]].map(([k, v]) => (
            <div key={k} className="sl-card p-4">
              <p className="sl-muted text-[12px]">{k}</p>
              <p className="sl-num mt-2 text-[24px] font-medium tracking-[-0.03em]">{v}</p>
            </div>
          ))}
          <div className="sl-card p-4 lg:col-span-2">
            <p className="sl-muted text-[12px]">Earnings, last 12 streams</p>
            <div className="mt-4 flex h-32 items-end gap-2">
              {bars.map((h, i) => (
                <span key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i === bars.length - 3 ? "var(--sl-accent)" : "var(--sl-surface-3)" }} />
              ))}
            </div>
          </div>
          <div className="sl-card p-4">
            <p className="sl-muted text-[12px]">Recent superchats</p>
            <div className="mt-3 space-y-3 text-[12.5px]">
              {[["Aarav", "₹500"], ["Meera", "₹1,000"], ["Kabir", "₹200"]].map(([n, a]) => (
                <div key={n} className="flex justify-between"><span>{n}</span><span className="sl-num sl-muted">{a}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

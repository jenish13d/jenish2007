import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/app/component/ui/icons";

/** Public marketing chrome: navigation, footer and page frame. */

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#how", label: "How it works" },
  { href: "/pricing", label: "Fees" },
  { href: "/company", label: "Company" },
];

export function MarketingNav() {
  return (
    <header className="relative z-20">
      <div className="mx-auto flex h-20 max-w-[1320px] items-center justify-between px-5 md:px-10">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="StreamLounge home">
          <LogoMark />
          <span className="sl-wordmark">STREAMLOUNGE</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[13.5px] text-[color:var(--sl-muted)] transition hover:text-[color:var(--sl-fg)]">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="sl-btn sl-btn-quiet hidden sm:inline-flex">Sign in</Link>
          <Link href="/signup" className="sl-btn sl-btn-mono">Start streaming</Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t" style={{ borderColor: "var(--sl-line)" }}>
      <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-10">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <LogoMark />
            <span className="sl-wordmark">STREAMLOUNGE</span>
          </Link>
          <p className="sl-body sl-muted mt-4 max-w-xs">Your Stream. Your Community. Your Earnings.</p>
          <p className="sl-kicker mt-8">Powered by Lumvik Solutions</p>
        </div>
        <FooterCol title="Product" links={[["/#product", "Features"], ["/#how", "How it works"], ["/pricing", "Fees"], ["/loungeboard", "LoungeBoard"]]} />
        <FooterCol title="Creators" links={[["/signup", "Create an account"], ["/login", "Sign in"], ["/dashboard", "Creator studio"], ["/me", "Supporter account"]]} />
        <FooterCol title="Company" links={[["/company", "About Lumvik Solutions"], ["/legal/terms", "Terms of service"], ["/legal/privacy", "Privacy policy"], ["/legal/fees", "Fee policy"]]} />
      </div>
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 border-t px-5 py-6 text-[12px] md:px-10" style={{ borderColor: "var(--sl-line)", color: "var(--sl-faint)" }}>
        <span>© {year} StreamLounge. A product of Lumvik Solutions.</span>
        <span>Payments are processed by Razorpay.</span>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="sl-kicker">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-[13.5px] text-[color:var(--sl-muted)] transition hover:text-[color:var(--sl-fg)]">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingPage({ children }: { children: ReactNode }) {
  return (
    <div className="sl" data-theme="dark">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

/** Abstract sculpture: a lit arc in a dark room. Pure SVG, no images. */
export function Sculpture({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 900 720" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="sl-beam" cx="78%" cy="0%" r="75%">
          <stop offset="0" stopColor="#f6f5f1" stopOpacity=".42" />
          <stop offset=".35" stopColor="#c9ccc8" stopOpacity=".1" />
          <stop offset="1" stopColor="#0b0c0d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sl-ring" x1="160" y1="560" x2="760" y2="160" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f6f5f1" stopOpacity=".85" />
          <stop offset=".35" stopColor="#7d8387" stopOpacity=".35" />
          <stop offset=".7" stopColor="#2a2f33" stopOpacity=".2" />
          <stop offset="1" stopColor="#c8a878" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="sl-ring-2" x1="760" y1="160" x2="160" y2="560" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f6f5f1" stopOpacity=".5" />
          <stop offset=".5" stopColor="#f6f5f1" stopOpacity="0" />
          <stop offset="1" stopColor="#f6f5f1" stopOpacity=".18" />
        </linearGradient>
        <filter id="sl-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id="sl-softer" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" /></filter>
      </defs>
      <rect width="900" height="720" fill="url(#sl-beam)" />
      <path d="M760 0 520 720" stroke="#f6f5f1" strokeOpacity=".05" strokeWidth="80" filter="url(#sl-soft)" />
      <g transform="rotate(-24 460 380)">
        <ellipse cx="460" cy="380" rx="330" ry="118" stroke="url(#sl-ring)" strokeWidth="22" filter="url(#sl-soft)" opacity=".55" />
        <ellipse cx="460" cy="380" rx="330" ry="118" stroke="url(#sl-ring)" strokeWidth="9" />
        <ellipse cx="460" cy="374" rx="322" ry="111" stroke="url(#sl-ring-2)" strokeWidth="1.2" filter="url(#sl-softer)" />
        <ellipse cx="460" cy="388" rx="338" ry="125" stroke="#f6f5f1" strokeOpacity=".06" strokeWidth="1" />
      </g>
      <g stroke="#f6f5f1" strokeOpacity=".09">
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={`M${600 + i * 40} 720 L900 ${420 + i * 40}`} />
        ))}
      </g>
    </svg>
  );
}

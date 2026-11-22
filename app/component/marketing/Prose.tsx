import type { ReactNode } from "react";

import { MarketingPage } from "./Chrome";

/** Long-form document layout for policy and company pages. */
export function ProsePage({ kicker, title, updated, intro, children }: {
  kicker: string;
  title: string;
  updated?: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MarketingPage>
      <article className="mx-auto max-w-[1320px] px-5 pb-24 pt-14 md:px-10 md:pt-20">
        <div className="grid gap-12 md:grid-cols-[1fr_1.7fr]">
          <header>
            <p className="sl-kicker sl-kicker-rule">{kicker}</p>
            <h1 className="sl-h1 mt-6">{title}</h1>
            {updated && <p className="sl-faint mt-4 text-[12.5px]">Last updated {updated}</p>}
          </header>
          <div className="sl-prose max-w-2xl">
            {intro && <div className="sl-lead mb-10">{intro}</div>}
            {children}
          </div>
        </div>
      </article>
      <style>{`
        .sl-prose h2 { font-size: 19px; font-weight: 550; letter-spacing: -.02em; margin: 40px 0 12px; }
        .sl-prose h2:first-child { margin-top: 0; }
        .sl-prose p, .sl-prose li { font-size: 14.5px; line-height: 1.7; color: var(--sl-fg-2); }
        .sl-prose p + p { margin-top: 12px; }
        .sl-prose ul { margin: 10px 0 0; padding-left: 18px; list-style: disc; }
        .sl-prose li + li { margin-top: 6px; }
        .sl-prose a { color: var(--sl-fg); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--sl-line-3); }
        .sl-prose strong { color: var(--sl-fg); font-weight: 550; }
        .sl-prose table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 14px; }
        .sl-prose th, .sl-prose td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--sl-line); }
        .sl-prose th { color: var(--sl-muted); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
      `}</style>
    </MarketingPage>
  );
}

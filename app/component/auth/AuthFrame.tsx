import Link from "next/link";
import type { ReactNode } from "react";

import { Sculpture } from "@/app/component/marketing/Chrome";
import { LogoMark } from "@/app/component/ui/icons";

/** Split layout for sign-in, sign-up and password screens. */
export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="sl grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" data-theme="dark">
      <main className="flex flex-col px-6 py-8 md:px-12">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="StreamLounge home">
          <LogoMark />
          <span className="sl-wordmark">STREAMLOUNGE</span>
        </Link>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-12">
          <h1 className="sl-h1">{title}</h1>
          <p className="sl-body sl-muted mt-3">{subtitle}</p>
          <div className="mt-9">{children}</div>
          {footer && <div className="sl-muted mt-8 text-[13.5px]">{footer}</div>}
        </div>
        <p className="sl-faint text-[12px]">
          StreamLounge · Powered by Lumvik Solutions ·{" "}
          <Link href="/legal/terms" className="hover:underline">Terms</Link> ·{" "}
          <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
        </p>
      </main>
      <aside className="sl-grain relative hidden overflow-hidden border-l lg:block" style={{ borderColor: "var(--sl-line)", background: "var(--sl-bg)" }}>
        <Sculpture className="absolute inset-0 h-full w-full" />
        <div className="relative z-[2] flex h-full flex-col justify-end p-12">
          <p className="sl-display !text-[clamp(40px,4.6vw,72px)]">
            Your stream.
            <br />
            <span className="sl-outline">Your community.</span>
            <br />
            Your earnings.
          </p>
        </div>
      </aside>
    </div>
  );
}

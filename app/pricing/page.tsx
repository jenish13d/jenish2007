import type { Metadata } from "next";
import Link from "next/link";

import { MarketingPage } from "@/app/component/marketing/Chrome";
import { FeeCards } from "@/app/component/marketing/FeeCards";

export const metadata: Metadata = {
  title: "Fees",
  description: "8% on StreamLounge QR superchats. 0% on your own Razorpay link. No subscription.",
};

export default function Page() {
  return (
    <MarketingPage>
      <section className="mx-auto max-w-[1320px] px-5 pb-24 pt-14 md:px-10 md:pt-20">
        <p className="sl-kicker sl-kicker-rule">Fees</p>
        <h1 className="sl-display mt-8 !text-[clamp(40px,6.5vw,96px)]">
          No subscription.
          <br />
          <span className="sl-outline">One clear fee.</span>
        </h1>
        <div className="mt-16 grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <div className="sl-body sl-muted max-w-sm space-y-4">
            <p>Creating a page, the overlays, the dashboard and the announcer are included. StreamLounge earns only when a viewer pays through your StreamLounge QR code or page.</p>
            <p>Payment gateway charges and applicable taxes are separate from the platform fee and are shown line by line in your finance reports.</p>
            <Link href="/legal/fees" className="sl-btn mt-4">Full fee policy</Link>
          </div>
          <FeeCards />
        </div>
      </section>
    </MarketingPage>
  );
}

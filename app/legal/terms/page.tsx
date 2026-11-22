import type { Metadata } from "next";
import Link from "next/link";

import { ProsePage } from "@/app/component/marketing/Prose";

export const metadata: Metadata = { title: "Terms of service" };

export default function Page() {
  return (
    <ProsePage
      kicker="Legal"
      title="Terms of service"
      updated="22 November 2026"
      intro={<>These terms describe how StreamLounge, a product of Lumvik Solutions, works for creators and supporters. They are written in plain language; where anything here is unclear, contact us before relying on it.</>}
    >
      <h2>The service</h2>
      <p>StreamLounge lets creators accept paid interactions from viewers (superchats, voice notes and similar) and show them on stream through browser-source overlays. Payments are processed by Razorpay.</p>
      <h2>Creator accounts</h2>
      <ul>
        <li>You must give accurate details and keep your sign-in secure. You are responsible for activity on your account.</li>
        <li>Your overlay URLs contain a secret key. Treat them like a password and rotate them if they are exposed.</li>
        <li>You are responsible for moderating what appears on your stream. StreamLounge provides filters and an emergency mute to help.</li>
      </ul>
      <h2>Fees and earnings</h2>
      <p>Fees are set out in the <Link href="/legal/fees">Fee policy</Link>. Your share of each StreamLounge payment is credited to your balance after verification and becomes available after the settlement hold. Payments through your own Razorpay link are between you, your supporter and Razorpay.</p>
      <h2>Refunds, disputes and reversals</h2>
      <p>Refunds and disputes raised through Razorpay reverse or hold the related share of your balance as described in the Fee policy. We may withhold a payout while a payment is under dispute or review.</p>
      <h2>Acceptable use</h2>
      <p>Do not use StreamLounge for unlawful content, harassment, impersonation, or to move money for anything other than genuine support of a creator. We may suspend accounts that put supporters, creators or the service at risk.</p>
      <h2>Changes</h2>
      <p>We will give notice in the studio before changing fees. A fee change never applies to a payment already recorded.</p>
    </ProsePage>
  );
}

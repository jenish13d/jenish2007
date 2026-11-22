import type { Metadata } from "next";

import { ProsePage } from "@/app/component/marketing/Prose";

export const metadata: Metadata = { title: "Privacy policy" };

export default function Page() {
  return (
    <ProsePage kicker="Legal" title="Privacy policy" updated="22 November 2026"
      intro={<>What StreamLounge collects, why, and who can see it.</>}>
      <h2>Supporters</h2>
      <ul>
        <li>You choose the name shown on stream. You can send anonymously.</li>
        <li>Card, UPI and bank details are entered with Razorpay and never reach StreamLounge.</li>
        <li>If you are signed in when you pay, your account is linked to the payment so you can see your history. Creators never see which account paid.</li>
        <li>Voice notes are stored privately and played only through the creator&apos;s overlay.</li>
      </ul>
      <h2>Creators</h2>
      <ul>
        <li>We store your profile, page settings, payments, ledger entries and payouts to run the service and keep accurate records.</li>
        <li>Twitch and Kick connections store access tokens encrypted at rest and are used only to verify your channel.</li>
        <li>If you connect your own Razorpay webhook, its secret is stored encrypted and used only to verify deliveries.</li>
      </ul>
      <h2>Retention</h2>
      <p>Financial records are kept as long as required for accounting, tax and dispute handling. Other data is removed or anonymised when no longer needed.</p>
      <h2>Your choices</h2>
      <p>You can update your profile at any time and ask us to export or delete your data, subject to records we must keep by law.</p>
    </ProsePage>
  );
}

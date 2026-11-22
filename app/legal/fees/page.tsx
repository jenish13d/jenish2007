import type { Metadata } from "next";
import Link from "next/link";

import { ProsePage } from "@/app/component/marketing/Prose";

export const metadata: Metadata = {
  title: "Fee policy",
  description: "How StreamLounge fees work: 8% on StreamLounge QR superchats, 0% on your own Razorpay payment link.",
};

export default function Page() {
  return (
    <ProsePage kicker="Fee policy" title="What StreamLounge charges, and when." updated="22 November 2026">
      <h2>Two payment channels</h2>
      <table>
        <thead><tr><th>Channel</th><th>StreamLounge fee</th><th>Who receives the money</th></tr></thead>
        <tbody>
          <tr><td>StreamLounge QR code and creator page</td><td>8% of the payment</td><td>Collected by StreamLounge, credited to your balance</td></tr>
          <tr><td>Your own Razorpay payment link</td><td>0%</td><td>Paid directly into your Razorpay account</td></tr>
        </tbody>
      </table>

      <h2>StreamLounge QR superchats: 8%</h2>
      <p>
        When a viewer pays through the QR code on your stream or your StreamLounge page, StreamLounge&apos;s platform fee is
        8% of the amount paid. The remaining 92% is your share. For example, on a ₹1,000 superchat the platform fee is ₹80
        and your share is ₹920.
      </p>
      <p>
        The fee is calculated on our servers from the payment Razorpay confirms, and the rate in force when the payment is
        captured is stored with that payment. A later change to the rate never changes a payment already recorded.
      </p>

      <h2>Your own Razorpay link: no StreamLounge commission</h2>
      <p>
        You can put your own Razorpay payment link in your YouTube video descriptions, Twitch panels or anywhere else.
        Those payments go straight to your Razorpay account and StreamLounge takes no commission on them. Because the money
        never passes through StreamLounge, it does not appear in your StreamLounge balance and cannot be withdrawn through
        StreamLounge.
      </p>
      <p>
        If you choose to connect your Razorpay webhook in Finance, verified payments from your link are shown in your reports
        for reference, labelled as your own Razorpay link and with a StreamLounge fee of ₹0.
      </p>

      <h2>Gateway charges and taxes</h2>
      <p>
        Razorpay charges a payment gateway fee, and taxes such as GST apply to it. These are separate from the StreamLounge
        platform fee. For QR superchats, the gateway fee Razorpay actually charged is recorded with each payment and shown
        separately in your finance reports, along with whether it was borne by StreamLounge or deducted from your share
        under the platform setting in force at the time. On your own Razorpay link, Razorpay&apos;s charges and taxes apply
        on your Razorpay account as agreed between you and Razorpay.
      </p>
      <p>Nothing on StreamLounge describes a payment as free of gateway charges or tax.</p>

      <h2>Refunds and disputes</h2>
      <p>
        If a QR superchat is refunded, your share is reversed in proportion to the amount refunded. If a payment is
        disputed, your share of it is held until the dispute is resolved and released if it is decided in your favour.
        Every adjustment is a new entry on the ledger; nothing is edited after the fact.
      </p>

      <h2>Settlement and withdrawals</h2>
      <p>
        Your share becomes available to withdraw after a settlement hold, shown on your Finance page. Withdrawals open once
        payouts are enabled for your account. See <Link href="/legal/terms">Terms of service</Link> for the full conditions.
      </p>
    </ProsePage>
  );
}

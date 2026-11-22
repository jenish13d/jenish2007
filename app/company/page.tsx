import type { Metadata } from "next";
import Link from "next/link";

import { ProsePage } from "@/app/component/marketing/Prose";

export const metadata: Metadata = {
  title: "Company",
  description: "StreamLounge is a product of Lumvik Solutions, an independent digital product and technology studio.",
};

export default function Page() {
  return (
    <ProsePage kicker="Company" title="StreamLounge is a product of Lumvik Solutions.">
      <h2>About Lumvik Solutions</h2>
      <p>
        Lumvik Solutions is an independent digital product and technology studio. We design and build websites, SaaS
        products, custom software and AI tools, and we build and operate products of our own. StreamLounge is one of them.
      </p>
      <h2>What StreamLounge is for</h2>
      <p>
        StreamLounge helps live creators earn from the communities they build: viewers support a stream with a QR superchat,
        and the creator sees it on screen, hears it announced and finds it in a ledger they can trust.
      </p>
      <h2>How we work</h2>
      <ul>
        <li>We state fees plainly and calculate them on our servers, never from what a browser sends.</li>
        <li>We record money movements once, on an append-only ledger, and correct with audited entries.</li>
        <li>We don&apos;t publish user counts, testimonials or certifications we can&apos;t stand behind.</li>
      </ul>
      <h2>Contact</h2>
      <p>
        For creator support, account or payment questions, sign in and use the contact details in your studio settings, or
        reach Lumvik Solutions through <a href="https://lumvik-solutions.vercel.app" rel="noreferrer">lumvik-solutions.vercel.app</a>.
      </p>
      <p>
        Read our <Link href="/legal/terms">Terms of service</Link>, <Link href="/legal/privacy">Privacy policy</Link> and{" "}
        <Link href="/legal/fees">Fee policy</Link>.
      </p>
    </ProsePage>
  );
}

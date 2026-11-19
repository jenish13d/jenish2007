import type { Metadata } from "next";

import PayoutsClient from "./PayoutsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Earnings & Payouts",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PayoutsClient />;
}

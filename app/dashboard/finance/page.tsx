import type { Metadata } from "next";

import FinanceClient from "./FinanceClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finance", robots: { index: false, follow: false } };

export default function Page() {
  return <FinanceClient />;
}

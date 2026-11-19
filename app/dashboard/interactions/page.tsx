import type { Metadata } from "next";

import ManageInteractionsClient from "./ManageInteractionsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage Interactions",
  description: "Choose what viewers can send, what it costs, and how alerts look and sound.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ManageInteractionsClient />;
}

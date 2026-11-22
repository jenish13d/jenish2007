import type { Metadata } from "next";

import SuperchatsClient from "./SuperchatsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Superchats", robots: { index: false, follow: false } };

export default function Page() {
  return <SuperchatsClient />;
}

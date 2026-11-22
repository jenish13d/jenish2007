import type { Metadata } from "next";

import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default function Page() {
  return <SettingsClient />;
}

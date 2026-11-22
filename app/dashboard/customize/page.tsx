import type { Metadata } from "next";

import CustomizeClient from "./CustomizeClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customization", robots: { index: false, follow: false } };

export default function Page() {
  return <CustomizeClient />;
}

import type { Metadata } from "next";

import MeClient from "./MeClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My LoungePoints",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MeClient />;
}

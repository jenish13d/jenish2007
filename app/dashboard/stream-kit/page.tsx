import type { Metadata } from "next";

import StreamKitClient from "./StreamKitClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stream Kit",
  description: "Payment link, QR code and overlay URLs for OBS, Streamlabs and StreamYard.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <StreamKitClient />;
}

import type { Metadata } from "next";

import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Owner console",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AdminClient />;
}

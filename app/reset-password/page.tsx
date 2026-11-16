import type { Metadata } from "next";

import ResetPasswordClient from "./ResetPasswordClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ResetPasswordClient />;
}

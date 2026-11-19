import type { Metadata } from "next";

import LoungeBoardClient from "./LoungeBoardClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "LoungeBoard",
  description: "Creators ranked by verified superchat support — globally, by country, state and city.",
};

export default function Page() {
  return <LoungeBoardClient />;
}

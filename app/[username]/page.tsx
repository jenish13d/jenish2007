import type { Metadata } from "next";
import { notFound } from "next/navigation";

import CreatorPage from "@/app/component/creator-page/CreatorPage";

export const dynamic = "force-dynamic";

const USERNAME = /^[A-Za-z0-9_]{3,30}$/;

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Support @${username}`,
    description: `Send @${username} a superchat on StreamLounge.`,
  };
}

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!USERNAME.test(username)) notFound();
  return <CreatorPage username={username} />;
}

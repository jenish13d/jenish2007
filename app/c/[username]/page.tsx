import { notFound, redirect } from "next/navigation";

/**
 * Short creator payment link: streamlounge.co/c/<username>.
 * Used by QR codes and stream panels; forwards to the creator's page, which is
 * where interaction choice, message, display name and checkout happen. All
 * attribution and amounts are decided server-side at order creation.
 */
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!/^[A-Za-z0-9_]{3,30}$/.test(username)) notFound();
  redirect(`/${username}`);
}

"use client";

import Link from "next/link";

import { LogoMark } from "@/app/component/ui/icons";

/** Shown instead of an endless loader when a page cannot load its data. */
export default function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="sl flex min-h-screen items-center justify-center px-5">
      <div role="alert" className="sl-card w-full max-w-md p-8 text-center">
        <LogoMark size={28} className="mx-auto" />
        <h1 className="sl-h2 mt-5">This page couldn&apos;t load</h1>
        <p className="sl-body sl-muted mt-3">{message}</p>
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button type="button" onClick={onRetry} className="sl-btn sl-btn-primary">Try again</button>
          <Link href="/" className="sl-btn">Go to homepage</Link>
        </div>
      </div>
    </main>
  );
}

"use client";

/**
 * Shown instead of an endless loader when a page cannot load its data.
 * Matches the StreamLounge dark-navy / mint palette.
 */
export default function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#071827] px-5 text-white">
      <div role="alert" className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur-xl">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-2xl text-[#6CCEB0]">ϟ</div>
        <h1 className="text-2xl font-light tracking-tight">Couldn&apos;t load this page</h1>
        <p className="mt-3 text-sm leading-6 text-white/65">{message}</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-gradient-to-r from-[#544388] to-[#4D8AFF] px-5 py-3 text-sm font-medium text-white"
          >
            Try again
          </button>
          <a href="/" className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/80 hover:text-white">
            Go to home
          </a>
        </div>
      </div>
    </main>
  );
}

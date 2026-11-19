"use client";

import { useEffect } from "react";

import LoadError from "./component/LoadError";

/** Route-level error boundary: a crash shows a retry, never a blank screen. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[route error]", error.digest ?? "", error);
  }, [error]);
  return <LoadError message="Something went wrong while loading this page." onRetry={reset} />;
}

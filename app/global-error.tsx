"use client";

import { useEffect } from "react";
import { logApiError } from "@/lib/api-errors";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { logApiError(error, "application"); }, [error]);
  return <html lang="en"><body><main role="alert">
    <h1>We couldn't load ALTURA.</h1>
    <p>Please try again in a moment.</p>
    <button type="button" onClick={reset}>Try again</button>
    <a href="/">Return to the storefront</a>
  </main></body></html>;
}

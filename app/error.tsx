"use client";

import { useEffect } from "react";
import { logApiError } from "@/lib/api-errors";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { logApiError(error, "page"); }, [error]);
  return <main className="account-loading" role="alert">
    <h1>We couldn't load this page.</h1>
    <p>Please try again in a moment.</p>
    <button type="button" onClick={reset}>Try again</button>
    <a href="/">Return to the storefront</a>
  </main>;
}

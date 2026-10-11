import { LoadingState } from "@/components/LoadingState";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountAuthForm } from "@/components/account/AccountAuthForm";
export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() { return <Suspense fallback={<main className="loading-page loading-page--session"><LoadingState message="Loading sign in…" /></main>}><AccountAuthForm mode="login" /></Suspense>; }

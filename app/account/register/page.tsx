import { LoadingState } from "@/components/LoadingState";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountAuthForm } from "@/components/account/AccountAuthForm";
export const metadata: Metadata = { title: "Create account" };
export default function RegisterPage() { return <Suspense fallback={<main className="loading-page loading-page--session"><LoadingState message="Loading account form…" /></main>}><AccountAuthForm mode="register" /></Suspense>; }

"use client";

import { Suspense } from "react";
import { AccountAuthForm } from "@/components/account/AccountAuthForm";

// Unified entry: /admin/login renders the same form/design as /account/login.
// ADMIN users are redirected to /admin after sign-in (see AccountAuthForm).
function AdminLoginAliasInner() {
  return <AccountAuthForm mode="login" />;
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="balmoral-auth"><div className="balmoral-auth__center"><div className="balmoral-auth__card" /></div></main>}>
      <AdminLoginAliasInner />
    </Suspense>
  );
}

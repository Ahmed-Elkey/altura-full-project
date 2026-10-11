"use client";

import { LoadingState } from "@/components/LoadingState";
import { getUserErrorMessage } from "@/lib/api-errors";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdminAuth } from "./AdminAuthProvider";

type NavItem = { label: string; href: string; icon: React.ReactNode };

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const groups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Commerce",
    items: [
      { label: "Dashboard", href: "/admin", icon: <Icon d="M2 2h5v5H2zM9 2h5v3H9zM9 7h5v7H9zM2 9h5v5H2z" /> },
      { label: "Orders", href: "/admin/orders", icon: <Icon d="M2 4.5h12v8H2zM2 4.5l6 4 6-4M5.5 9.5h5" /> },
      { label: "Payments", href: "/admin/payments", icon: <Icon d="M2 4.5h12v7H2zM2 7h12M4.5 10.5h3" /> },
      { label: "Returns", href: "/admin/returns", icon: <Icon d="M3 8a5 5 0 0 1 8.5-3.5M13 8a5 5 0 0 1-8.5 3.5M11.5 1.8v2.7H8.8M4.5 14.2v-2.7h2.7" /> },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", href: "/admin/products", icon: <Icon d="M2 5.5L8 2l6 3.5v5L8 14l-6-3.5zM2 5.5L8 9l6-3.5M8 9v5" /> },
      { label: "Categories", href: "/admin/categories", icon: <Icon d="M2 3h5v4H2zM9 3h5v4H9zM2 9h5v4H2zM9 9h5v4H9z" /> },
      { label: "Collections", href: "/admin/collections", icon: <Icon d="M2 3h12v10H2zM5 3v10M2 7h12" /> },
      { label: "Inventory", href: "/admin/inventory", icon: <Icon d="M2 3.5h12v9H2zM2 6.5h12M5.5 9v3.5M8.5 9v2.5M11.5 9v3.5" /> },
      { label: "Discounts", href: "/admin/discounts", icon: <Icon d="M3 3h10v10H3zM5.5 5.5h.01M10.5 10.5h.01M11 5L5 11" /> },
    ],
  },
  {
    title: "Relations",
    items: [
      { label: "Customers", href: "/admin/customers", icon: <Icon d="M5.8 7.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM2 13.5c.6-2.3 2-3.4 3.8-3.4s3.2 1.1 3.8 3.4M10.5 3.4a2.2 2.2 0 0 1 0 3.9M11.5 10.3c1 .5 1.8 1.5 2.1 3.2" /> },
      { label: "Support", href: "/admin/support", icon: <Icon d="M2 3h12v8H7l-4 3v-3H2zM5 6h6M5 8h4" /> },
      { label: "Newsletter", href: "/admin/newsletter", icon: <Icon d="M2 4h12v8H2zM2 4l6 5 6-5" /> },
      { label: "Shipping", href: "/admin/shipping", icon: <Icon d="M1.8 4.5H9v7H1.8zM9 7.5h3l2.2 2.4v1.6H9M4 13.4a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2zM11.5 13.4a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2z" /> },
      { label: "Audit", href: "/admin/audit", icon: <Icon d="M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4zM5.8 8l1.6 1.6L10.3 6.5" /> },
    ],
  },
];

function isActive(href: string, pathname: string | null) {
  return href === "/admin" ? pathname === href : pathname?.startsWith(href);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state, user, logout } = useAdminAuth();
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (isLogin) router.replace(`/account/login?next=${encodeURIComponent("/admin")}`);
    else if (state === "unauthenticated") router.replace(`/account/login?next=${encodeURIComponent(pathname ?? "/admin")}`);
  }, [isLogin, pathname, router, state]);

  if (isLogin) return null;
  if (state === "loading") {
    return <main className="loading-page loading-page--session"><LoadingState message="Restoring your admin session…" /></main>;
  }
  if (state !== "authenticated" || !user) return null;

  const operatorName = user.firstName || user.email.split("@")[0];
  async function handleSignOut() {
    setSignOutError("");
    setSigningOut(true);
    try {
      await logout();
      router.replace("/account/login");
    } catch (caught) {
      setSignOutError(getUserErrorMessage(caught, "session"));
      setSigningOut(false);
    }
  }

  return (
    <div className="admin-shell customer-admin">
      <header className="balmoral-account__header customer-admin__header">
        <Link href="/admin" className="balmoral-account__brand" aria-label="ALTURA admin home">ALTURA</Link>
        <Link href="/account/profile" className="balmoral-account__avatar" aria-label="Profile">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="14" cy="14" r="13" stroke="currentColor" strokeOpacity="0.18" />
            <circle cx="14" cy="11" r="3.2" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8.8 19c1-2.2 2.7-3.4 5.2-3.4s4.2 1.2 5.2 3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </Link>
      </header>
      <div className="customer-admin__body">
        <aside className="customer-admin__sidebar">
          <nav className="customer-admin__nav" aria-label="ALTURA Studio">
            {groups.map(group => (
              <div className="customer-admin__navGroup" key={group.title}>
                <p>{group.title}</p>
                {group.items.map(item => {
                  const active = isActive(item.href, pathname);
                  return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>{item.icon}<span>{item.label}</span></Link>;
                })}
              </div>
            ))}
          </nav>
          <div className="customer-admin__operator">
            <strong>{operatorName}</strong>
            <span>{user.email}</span>
            <button type="button" disabled={signingOut} onClick={() => void handleSignOut()}>{signingOut ? "Signing out…" : "Sign out"}</button>
            <Link href="/">View store →</Link>
            {signOutError ? <p role="alert">{signOutError}</p> : null}
          </div>
        </aside>
        <main className="admin-main" id="main-content">{children}</main>
      </div>
    </div>
  );
}

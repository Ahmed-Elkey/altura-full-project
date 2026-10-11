import type { Metadata } from "next";
import { NewsletterLinkForm } from "@/components/NewsletterLinkForm";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function NewsletterUnsubscribePage() { return <NewsletterLinkForm action="unsubscribe" />; }

import type { Metadata } from "next";
import { NewsletterLinkForm } from "@/components/NewsletterLinkForm";
export const metadata: Metadata = { title: "Confirm newsletter", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function NewsletterConfirmPage() { return <NewsletterLinkForm action="confirm" />; }

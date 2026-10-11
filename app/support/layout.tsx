import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Support conversation', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function SupportLayout({ children }: { children: React.ReactNode }) { return children; }

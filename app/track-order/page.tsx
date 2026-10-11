import type { Metadata } from "next";
import { TrackOrderClient } from "@/components/TrackOrderClient";
export const metadata: Metadata = {
  title: "Track order",
  robots: { index: false, follow: false },
};
export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; email?: string }>;
}) {
  const query = await searchParams;
  return (
    <TrackOrderClient
      initialOrderNumber={query.order}
      initialEmail={query.email}
    />
  );
}

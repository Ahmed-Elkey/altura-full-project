import { redirect } from "next/navigation";

// Legacy route: the return flow lives on /start-a-return.
// This redirect preserves ?order= links (emails, account pages, tests).
export default async function ReturnsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params?.order;
  const order = Array.isArray(raw) ? raw[0] : raw;
  redirect(order ? `/start-a-return?order=${encodeURIComponent(order)}` : "/start-a-return");
}

import { AccountShell } from "@/components/account/AccountShell";
import { OrdersClient } from "@/components/account/OrdersClient";
export default function AccountOverviewPage() {
  return (
    <AccountShell>
      <OrdersClient />
    </AccountShell>
  );
}

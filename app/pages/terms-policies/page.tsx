import { infoMetadata } from "@/lib/seo";
import { TermsPoliciesContent } from "@/components/TermsPoliciesContent";

export const metadata = infoMetadata("terms-policies");

export default function TermsPoliciesPage() {
  return (
    <main className="flex-grow-1 customer-info" role="main">
      <TermsPoliciesContent />
    </main>
  );
}

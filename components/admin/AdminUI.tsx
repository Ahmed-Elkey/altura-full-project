import Link from "next/link";

export function AdminPageHeader({
  index,
  eyebrow,
  title,
  description,
  action,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <p className="admin-page-eyebrow">
        <span className="admin-page-index">{index}</span>
        <span className="admin-page-kicker">{eyebrow}</span>
      </p>
      <div className="admin-page-heading-row">
        <div className="admin-page-heading">
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="admin-page-action">{action}</div> : null}
      </div>
    </header>
  );
}

const ADMIN_STATUS_OK = new Set(["ACTIVE", "PAID", "CONFIRMED", "DELIVERED", "IN_STOCK", "COLLECTED", "REFUNDED", "CLOSED", "APPROVED", "COMPLETED"]);
const ADMIN_STATUS_WARN = new Set(["PAYMENT_REVIEW", "LOW_STOCK", "REQUIRES_ACTION", "PENDING", "PROCESSING", "AWAITING", "PARTIALLY_REFUNDED", "DRAFT"]);
const ADMIN_STATUS_BAD = new Set(["FAILED", "DISABLED", "CANCELLED", "OUT_OF_STOCK", "SUSPENDED", "REJECTED", "EXPIRED"]);

export function AdminStatus({ value }: { value: string | null | undefined }) {
  const raw = (value || "UNKNOWN").toUpperCase();
  const tone = ADMIN_STATUS_OK.has(raw) ? "ok" : ADMIN_STATUS_WARN.has(raw) ? "warn" : ADMIN_STATUS_BAD.has(raw) ? "bad" : "muted";
  const labels: Record<string, string> = {
    PROCESSING: "Preparing",
    PAYMENT_REVIEW: "Payment review",
    LOW_STOCK: "Low stock",
    OUT_OF_STOCK: "Out of stock",
    IN_STOCK: "In stock",
    CASH_ON_DELIVERY: "Cash on delivery",
    PARTIALLY_REFUNDED: "Partially refunded",
  };
  const label = labels[raw] || raw.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className="admin-status" data-tone={tone}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function AdminEmpty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="admin-empty">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M17.5 17.5L24 24" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

export function AdminError({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="admin-error" role="alert">
      <span className="admin-error-tag">Attention</span>
      <strong>{message}</strong>
      {retry ? (
        <button type="button" className="admin-error-retry" onClick={retry}>
          Retry →
        </button>
      ) : null}
    </div>
  );
}

export function AdminPagination({
  page,
  pages,
  total,
  loading = false,
  onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}) {
  const lastPage = Math.max(1, pages);
  return (
    <nav className="admin-pagination" aria-label="Table pages">
      <span aria-live="polite">
        Page {page} of {lastPage} · {total} records
      </span>
      <div>
        <button type="button" className="admin-secondary-button admin-pagination-btn" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>
          ← Previous
        </button>
        <button
          type="button"
          className="admin-secondary-button admin-pagination-btn"
          disabled={loading || page >= lastPage}
          onClick={() => onPageChange(page + 1)}
        >
          Next →
        </button>
      </div>
    </nav>
  );
}

export function AdminSectionTitle({ label, title, href }: { label: string; title: string; href?: string }) {
  return (
    <div className="admin-section-title">
      <div className="admin-section-heading">
        <span className="admin-section-label">{label}</span>
        <h2>{title}</h2>
      </div>
      {href ? (
        <Link className="admin-inline-link" href={href}>
          Open register →
        </Link>
      ) : null}
    </div>
  );
}

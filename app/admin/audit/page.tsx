"use client";

import { getUserErrorMessage } from "@/lib/api-errors";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminEmpty, AdminError, AdminPageHeader, AdminSectionTitle } from "@/components/admin/AdminUI";
import { adminDate } from "@/lib/admin-format";

type AuditEntry = { id: string; action: string; entityType: string; entityId: string | null; metadata: Record<string, unknown> | null; createdAt: string; actor: { id: string; email: string; firstName: string | null; lastName: string | null; role: string } | null };

export default function AdminAuditPage() {
  const { apiFetch } = useAdminAuth();
  const [data, setData] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setData(await apiFetch<AuditEntry[]>("/admin/audit?limit=100")); }
    catch (cause) { setError(getUserErrorMessage(cause, "admin")); }
  }, [apiFetch]);
  useEffect(() => { void load(); }, [load]);

  return <>
    <AdminPageHeader index="10" eyebrow="Traceability" title="Audit log" description="Recent sensitive commerce and access mutations, with the operator and entity context that produced them." action={<button className="admin-secondary-button" type="button" onClick={() => void load()}>Refresh log</button>} />
    {error ? <AdminError message={error} retry={() => void load()} /> : null}
    <section className="admin-panel"><AdminSectionTitle label="01 / Recent events" title={`${data ? data.length : ""} audit entries`} />{data && !data.length ? <AdminEmpty title="No audit events" /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Action</th><th>Entity</th><th>Operator</th><th>Metadata</th><th>When</th></tr></thead><tbody>{data?.map((entry) => <tr key={entry.id}><td><strong>{entry.action.replaceAll("_", " ")}</strong></td><td>{entry.entityType}<small className="admin-mono">{entry.entityId || "—"}</small></td><td>{entry.actor ? <>{entry.actor.email}<small>{entry.actor.role}</small></> : "System"}</td><td><code className="admin-mono">{entry.metadata ? JSON.stringify(entry.metadata) : "—"}</code></td><td>{adminDate(entry.createdAt)}</td></tr>) ?? <tr><td colSpan={5} className="admin-table-loading">Loading audit log…</td></tr>}</tbody></table></div>}</section>
  </>;
}

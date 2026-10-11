"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({ open, label, onClose, children, small }: { open: boolean; label: string; onClose: () => void; children: ReactNode; small?: boolean }) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])') || []).filter(element => element.getClientRects().length > 0);
    const focusFirst = () => (focusable()[0] || dialog.current)?.focus();
    focusFirst();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Let an open native select consume Escape before closing its parent dialog.
        if (CSS.supports("selector(select:open)") && dialog.current?.querySelector("select:open")) return;
        event.preventDefault(); close.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.current?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    function onFocus(event: FocusEvent) {
      if (event.target instanceof Node && !dialog.current?.contains(event.target)) focusFirst();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="acct-scrim" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} className={`acct-modal${small ? " acct-modal--sm" : ""}`} role="dialog" aria-modal="true" aria-label={label} onClick={event => event.stopPropagation()}>
        <button type="button" className="acct-modal__close" aria-label="Close" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M16 2 2 16M2 2l14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        {children}
      </div>
    </div>, document.body,
  );
}

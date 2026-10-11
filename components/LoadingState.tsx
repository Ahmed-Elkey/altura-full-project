/** Shared loading treatment; decorative placeholders never look interactive. */
export function LoadingState({ message = "Loading ALTURA…", compact = false }: { message?: string; compact?: boolean }) {
  return (
    <div className={`loading-state${compact ? " loading-state--compact" : ""}`} role="status" aria-live="polite" aria-label={message}>
      <div className="loading-state__heading">
        <span className="loading-state__spinner" aria-hidden="true" />
        <div><strong>{message}</strong><p>Please wait a moment.</p></div>
      </div>
      <div className="loading-state__skeleton" aria-hidden="true">
        <span /><span /><span />
      </div>
    </div>
  );
}

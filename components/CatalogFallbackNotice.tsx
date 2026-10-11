export function CatalogFallbackNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <p role="status" data-catalog-fallback className="catalog-fallback-notice">
    Preview catalog: prices, stock and live admin updates can&apos;t be verified.
  </p>;
}

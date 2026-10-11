import Link from "next/link";

export function Wordmark() {
  return (
    <Link href="/" className="wordmark site-header__logoLink" aria-label="ALTURA home">
      <span className="wordmark-text">ALTURA</span>
    </Link>
  );
}

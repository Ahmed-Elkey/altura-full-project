import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <p className="home-section-kicker">404 / ALTURA</p>
      <h1>Off the route.</h1>
      <p>The page you’re looking for doesn’t exist or has moved.</p>
      <div className="not-found-actions">
        <Link href="/" className="home-cta home-cta--dark">Home</Link>
        <Link href="/collections/shopall" className="text-link">Shop all</Link>
      </div>
    </main>
  );
}

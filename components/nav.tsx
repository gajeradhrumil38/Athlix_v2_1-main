import Link from 'next/link';

export function Nav() {
  return (
    <header className="row" style={{ padding: '1rem 0' }}>
      <Link href="/" style={{ fontWeight: 700 }}>
        Athlix
      </Link>
      <nav className="row">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/login">Login</Link>
        <Link href="/api/health">API Health</Link>
      </nav>
    </header>
  );
}

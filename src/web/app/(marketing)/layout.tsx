import Link from 'next/link';
import type { ReactNode } from 'react';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <nav
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '14px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Link
            href="/product"
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
          >
            <span
              className="pulse-dot"
              style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }}
            />
            <span
              className="label"
              style={{ color: 'var(--ink)', fontWeight: 700, letterSpacing: '0.18em' }}
            >
              GABAN
            </span>
          </Link>

          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <Link href="/product" className="nav-link">Product</Link>
            <Link href="/docs" className="nav-link">Docs</Link>
            <Link href="/support" className="nav-link">Support</Link>
            <Link
              href="/login"
              className="btn btn--primary"
              style={{ padding: '8px 16px', fontSize: 13 }}
            >
              Operator login →
            </Link>
          </div>
        </nav>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 28px 96px' }}>
        {children}
      </main>

      <footer
        style={{
          borderTop: '1px solid var(--line)',
          padding: '32px 28px',
          color: 'var(--mute)',
          fontSize: 13,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <span className="label">© GABAN · LEAD OPERATOR CONSOLE</span>
          <span className="label numeric">v1.0 · BUILD 2026.05</span>
        </div>
      </footer>
    </div>
  );
}

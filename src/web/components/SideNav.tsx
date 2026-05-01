'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/dashboard',  label: 'OVERVIEW',  code: '01' },
  { href: '/',           label: 'WEEKLY',    code: '02' },
  { href: '/history',    label: 'HISTORY',   code: '03' },
  { href: '/campaigns',  label: 'CAMPAIGNS', code: '04' },
  { href: '/responses',  label: 'RESPONSES', code: '05' },
  { href: '/outcomes',   label: 'OUTCOMES',  code: '06' },
  { href: '/runs',       label: 'RUNS',      code: '07' },
  { href: '/usage',      label: 'USAGE',     code: '08' },
  { href: '/settings',   label: 'SETTINGS',  code: '09' },
];

export default function SideNav() {
  const path = usePathname();

  return (
    <nav
      style={{
        width: 220,
        borderRight: '1px solid var(--line)',
        background: 'color-mix(in oklab, var(--surface) 70%, transparent)',
        backdropFilter: 'blur(10px)',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <div style={{ padding: '0 18px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 24, height: 24,
            border: '1px solid var(--accent)',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
            borderRadius: 2,
          }}
        >
          ⌬
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.16em', fontWeight: 600 }}>
            GABAN
          </span>
          <span className="label" style={{ fontSize: 8 }}>OPERATOR · v1</span>
        </div>
      </div>

      <hr className="hr-fade" style={{ margin: '0 12px 12px' }} />

      <div className="label" style={{ padding: '0 18px 8px' }}>SECTIONS</div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {ITEMS.map((item) => {
          const active =
            item.href === '/' ? path === '/' : path === item.href || path?.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className="nav-link" data-active={active ? 'true' : 'false'}>
              <span style={{ flex: 1 }}>{item.label}</span>
              <span style={{ fontSize: 9, opacity: 0.55 }}>{item.code}</span>
            </Link>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', padding: '16px 18px', borderTop: '1px solid var(--line)' }}>
        <div className="label" style={{ marginBottom: 6 }}>CHANNEL</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pulse-dot" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-2)' }}>
            LIVE · gleampro
          </span>
        </div>
      </div>
    </nav>
  );
}

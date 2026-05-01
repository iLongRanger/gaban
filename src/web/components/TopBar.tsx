'use client';

import { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';

export default function TopBar() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      setTime(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 28px',
        borderBottom: '1px solid var(--line)',
        background: 'color-mix(in oklab, var(--surface) 50%, transparent)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--accent)' }}>◉</span>
        <span>SECTOR / METRO VANCOUVER</span>
      </div>

      <div style={{ flex: 1 }} />

      <div className="label numeric" suppressHydrationWarning style={{ color: 'var(--ink-2)' }}>
        {time || '--:--:--'} PT
      </div>

      <span style={{ width: 1, height: 16, background: 'var(--line-2)' }} />

      <ThemeToggle />
    </header>
  );
}

'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (document.documentElement.dataset.theme as Theme) || 'dark';
    setTheme(stored);
    setMounted(true);
  }, []);

  function flip() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('halon.theme', next); } catch {}
  }

  return (
    <button
      onClick={flip}
      aria-label="Toggle theme"
      className="btn"
      style={{ padding: '6px 10px', fontSize: 10 }}
      suppressHydrationWarning
    >
      <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
        {mounted && theme === 'dark' ? '◐' : '◑'}
      </span>
      <span suppressHydrationWarning>{mounted ? theme : 'dark'}</span>
    </button>
  );
}

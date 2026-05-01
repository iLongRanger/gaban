'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export default function WeekSelector({ weeks, current }: { weeks: string[]; current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('week', e.target.value);
    router.push('/?' + params.toString());
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="label">CYCLE</span>
      <select
        value={current}
        onChange={onChange}
        className="field"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.1em',
          padding: '6px 10px',
        }}
      >
        {weeks.map((w) => (
          <option key={w} value={w}>{w}</option>
        ))}
      </select>
    </div>
  );
}

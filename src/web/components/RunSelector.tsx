'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface RunOption {
  id: number;
  label: string;
}

export default function RunSelector({ runs, current }: { runs: RunOption[]; current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('run', e.target.value);
    params.delete('week');
    router.push('/?' + params.toString());
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="label">RUN</span>
      <select
        value={current}
        onChange={onChange}
        className="field"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.1em',
          padding: '6px 10px',
          maxWidth: 320,
        }}
      >
        {runs.map((run) => (
          <option key={run.id} value={run.id}>{run.label}</option>
        ))}
      </select>
    </div>
  );
}

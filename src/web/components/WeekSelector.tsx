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
    <select
      value={current}
      onChange={onChange}
      className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
    >
      {weeks.map(w => (
        <option key={w} value={w}>{w}</option>
      ))}
    </select>
  );
}

'use client';

import { useState } from 'react';

const STATUSES = ['new', 'contacted', 'interested', 'rejected', 'closed'];

export default function StatusDropdown({
  leadId,
  initialStatus,
}: {
  leadId: number;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    setStatus(newStatus);
    await fetch('/api/leads/' + leadId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  return (
    <select
      value={status}
      onChange={onChange}
      className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
    >
      {STATUSES.map(s => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

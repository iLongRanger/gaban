'use client';

import Link from 'next/link';
import { useState } from 'react';

interface Lead {
  id: number;
  business_name: string;
  type: string;
  total_score: number;
  distance_km: number;
  status: string;
  address: string;
}

const STATUSES = ['new', 'contacted', 'interested', 'rejected', 'closed'];

export default function LeadCard({ lead }: { lead: Lead }) {
  const [status, setStatus] = useState(lead.status);

  async function onStatusChange(e: React.MouseEvent<HTMLSelectElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.preventDefault();
    e.stopPropagation();
    const newStatus = e.target.value;
    setStatus(newStatus);
    await fetch('/api/leads/' + lead.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <Link href={'/leads/' + lead.id} className="flex-1">
          <h3 className="font-semibold text-gray-900">{lead.business_name}</h3>
          <p className="text-sm text-gray-500">{lead.type}</p>
          <p className="text-xs text-gray-400 mt-1">{lead.address}</p>
        </Link>
        <div className="flex flex-col items-end gap-1">
          <span className="text-lg font-bold text-blue-600">{lead.total_score}</span>
          <select
            value={status}
            onClick={onStatusChange}
            onChange={handleStatusChange}
            className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white"
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">{lead.distance_km} km</span>
        </div>
      </div>
    </div>
  );
}

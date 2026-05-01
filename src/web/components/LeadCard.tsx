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

function scoreTone(score: number) {
  if (score >= 80) return 'var(--accent)';
  if (score >= 60) return 'var(--ink)';
  if (score >= 40) return 'var(--warn)';
  return 'var(--danger)';
}

export default function LeadCard({ lead }: { lead: Lead }) {
  const [status, setStatus] = useState(lead.status);
  const segments = 10;
  const onCount = Math.round((lead.total_score / 100) * segments);
  const tone = scoreTone(lead.total_score);

  function stop(e: React.SyntheticEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
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
    <Link
      href={'/leads/' + lead.id}
      className="frame frame--brackets"
      style={{
        display: 'block',
        padding: '16px 18px',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'all 160ms ease',
      }}
    >
      <span className="br-tr" /><span className="br-bl" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span className="label" style={{ color: 'var(--mute)' }}>
              ID/{String(lead.id).padStart(4, '0')}
            </span>
            <span style={{ color: 'var(--line-2)' }}>·</span>
            <span className="label">{lead.type || 'UNCLASSIFIED'}</span>
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, lineHeight: 1.2 }}>
            {lead.business_name}
          </h3>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4, marginBottom: 0 }}>
            {lead.address || '—'}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
            <span className="label numeric" style={{ color: 'var(--ink-2)' }}>
              ↗ {Number(lead.distance_km || 0).toFixed(1)} KM
            </span>
            <div onClick={stop} style={{ display: 'inline-flex' }}>
              <select
                value={status}
                onChange={handleStatusChange}
                className="field"
                style={{
                  padding: '4px 8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, minWidth: 130 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span className="numeric" style={{ fontSize: 32, fontWeight: 600, color: tone, lineHeight: 1 }}>
              {lead.total_score}
            </span>
            <span className="label numeric" style={{ color: 'var(--faint)' }}>/100</span>
          </div>
          <div className="meter" style={{ width: 120 }}>
            {Array.from({ length: segments }).map((_, i) => (
              <span key={i} data-on={i < onCount ? 'true' : 'false'} />
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CampaignActions({
  campaignId,
  status,
  sendWindowStart,
  sendWindowEnd,
}: {
  campaignId: number;
  status: string;
  sendWindowStart: string;
  sendWindowEnd: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(sendWindowStart);
  const [end, setEnd] = useState(sendWindowEnd);
  const [error, setError] = useState<string | null>(null);
  const canPause = status === 'active';
  const action = canPause ? 'pause' : 'resume';

  async function submit() {
    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaignId}/${action}`, { method: 'POST' });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  async function saveWindow() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ send_window_start: start, send_window_end: end }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not update send window');
    }
  }

  if (!['active', 'paused'].includes(status)) return null;

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={busy}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          />
          <span className="text-gray-400">–</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={busy}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          />
          <button
            onClick={saveWindow}
            disabled={busy}
            className="btn"
            style={{ opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            {busy ? 'SAVING…' : 'SAVE'}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setError(null);
              setStart(sendWindowStart);
              setEnd(sendWindowEnd);
            }}
            disabled={busy}
            className="btn"
          >
            CANCEL
          </button>
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="btn">
          EDIT SCHEDULE
        </button>
      )}

      <button
        onClick={submit}
        disabled={busy}
        className="btn"
        style={{ opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
      >
        {busy ? 'UPDATING…' : canPause ? 'PAUSE CAMPAIGN' : 'RESUME CAMPAIGN'}
      </button>
    </div>
  );
}

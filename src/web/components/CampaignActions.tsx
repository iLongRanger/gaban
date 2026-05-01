'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CampaignActions({
  campaignId,
  status,
}: {
  campaignId: number;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const canPause = status === 'active';
  const action = canPause ? 'pause' : 'resume';

  async function submit() {
    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaignId}/${action}`, { method: 'POST' });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  if (!['active', 'paused'].includes(status)) return null;

  return (
    <button
      onClick={submit}
      disabled={busy}
      className="btn"
      style={{ opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
    >
      {busy ? 'UPDATING…' : canPause ? 'PAUSE CAMPAIGN' : 'RESUME CAMPAIGN'}
    </button>
  );
}

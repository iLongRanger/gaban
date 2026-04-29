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
      className="border border-gray-300 bg-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
    >
      {busy ? 'Updating...' : canPause ? 'Pause Campaign' : 'Resume Campaign'}
    </button>
  );
}

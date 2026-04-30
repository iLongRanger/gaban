'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function OutcomeForm({ campaignLeadId }: { campaignLeadId: number }) {
  const router = useRouter();
  const [type, setType] = useState('disposition');
  const [outcome, setOutcome] = useState('interested');
  const [scheduledFor, setScheduledFor] = useState('');
  const [kind, setKind] = useState('call');
  const [signedDate, setSignedDate] = useState('');
  const [valueMonthly, setValueMonthly] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit() {
    setBusy(true);
    setMessage('');
    const payload =
      type === 'meeting'
        ? { type, scheduled_for: scheduledFor, kind, notes }
        : type === 'contract'
          ? { type, signed_date: signedDate, value_monthly: valueMonthly, notes }
          : { type, outcome, notes };

    const res = await fetch(`/api/campaign-leads/${campaignLeadId}/outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error || 'Failed to save outcome');
      return;
    }
    setNotes('');
    setMessage('Saved.');
    router.refresh();
  }

  return (
    <div className="border border-gray-100 rounded p-3 bg-white mt-3">
      <div className="grid grid-cols-3 gap-2 mb-2">
        <select value={type} onChange={e => setType(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm">
          <option value="disposition">Disposition</option>
          <option value="meeting">Meeting</option>
          <option value="contract">Contract</option>
        </select>
        {type === 'disposition' ? (
          <select value={outcome} onChange={e => setOutcome(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm">
            <option value="interested">Interested</option>
            <option value="not_interested">Not interested</option>
            <option value="out_of_scope">Out of scope</option>
            <option value="follow_up_later">Follow up later</option>
          </select>
        ) : null}
        {type === 'meeting' ? (
          <>
            <input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm" />
            <select value={kind} onChange={e => setKind(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm">
              <option value="call">Call</option>
              <option value="site_visit">Site visit</option>
              <option value="quote_review">Quote review</option>
            </select>
          </>
        ) : null}
        {type === 'contract' ? (
          <>
            <input type="date" value={signedDate} onChange={e => setSignedDate(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm" />
            <input type="number" min="0" value={valueMonthly} onChange={e => setValueMonthly(e.target.value)} className="px-2 py-1 border border-gray-300 rounded text-sm" placeholder="Monthly $" />
          </>
        ) : null}
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
        rows={2}
        placeholder="Notes"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={submit}
          disabled={busy || (type === 'meeting' && !scheduledFor)}
          className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save Outcome'}
        </button>
        {message ? (
          <span className={`text-xs ${message === 'Saved.' ? 'text-green-700' : 'text-red-600'}`}>{message}</span>
        ) : null}
      </div>
    </div>
  );
}

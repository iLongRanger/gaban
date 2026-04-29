'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Preset {
  id: number;
  name: string;
  categories: string;
}

interface Lead {
  id: number;
  business_name: string;
  type: string | null;
  email: string | null;
  address: string | null;
  total_score: number;
  distance_km: number;
  week: string;
  status: string;
  draft_count: number;
}

function localDateTimeValue(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default function CampaignCreateForm({
  presets,
  leads,
  weeks,
}: {
  presets: Preset[];
  leads: Lead[];
  weeks: string[];
}) {
  const router = useRouter();
  const [presetId, setPresetId] = useState(presets[0]?.id || 0);
  const [week, setWeek] = useState(weeks[0] || '');
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [dailyCap, setDailyCap] = useState(5);
  const [startAt, setStartAt] = useState(localDateTimeValue());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const preset = presets.find((item) => item.id === presetId);
  const categories = preset ? JSON.parse(preset.categories).join(', ') : '';
  const visibleLeads = useMemo(
    () => leads.filter((lead) => !week || lead.week === week),
    [leads, week]
  );
  const eligibleLeadIds = visibleLeads
    .filter((lead) => lead.email && lead.draft_count >= 3)
    .map((lead) => lead.id);

  function toggleLead(id: number) {
    setSelected((current) =>
      current.includes(id) ? current.filter((leadId) => leadId !== id) : [...current, id]
    );
  }

  function selectAllEligible() {
    setSelected(eligibleLeadIds);
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset_id: presetId,
        name: name || `${preset?.name || 'Campaign'} - ${new Date().toLocaleDateString()}`,
        lead_ids: selected,
        daily_cap: dailyCap,
        start_at: new Date(startAt).toISOString(),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to create campaign');
      setSubmitting(false);
      return;
    }

    router.push('/campaigns');
    router.refresh();
  }

  return (
    <div className="grid grid-cols-[360px_1fr] gap-6">
      <aside className="bg-white border border-gray-200 rounded-lg p-4 h-fit">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Campaign Setup</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Preset</span>
            <select
              value={presetId}
              onChange={(e) => setPresetId(Number(e.target.value))}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white"
            >
              {presets.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            {categories ? <span className="block text-xs text-gray-400 mt-1">{categories}</span> : null}
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Campaign Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Restaurants - Week 1"
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Start</span>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Daily Cap</span>
            <input
              type="number"
              min="0"
              max="50"
              value={dailyCap}
              onChange={(e) => setDailyCap(Number(e.target.value))}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </label>

          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-3">
            {selected.length} leads selected. The bot will create Touch 1, Touch 2, and Touch 3 schedules after you create the campaign.
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            onClick={submit}
            disabled={submitting || !presetId || selected.length === 0}
            className="w-full bg-gray-900 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Campaign'}
          </button>
        </div>
      </aside>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Approved Leads</h2>
            <p className="text-xs text-gray-500">Only leads with email and all 3 draft styles can be selected.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm bg-white"
            >
              {weeks.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button onClick={selectAllEligible} className="border border-gray-300 rounded px-3 py-2 text-sm bg-white">
              Select Eligible
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {visibleLeads.map((lead) => {
            const eligible = Boolean(lead.email && lead.draft_count >= 3);
            return (
              <label
                key={lead.id}
                className={`flex items-start gap-3 border rounded-lg p-3 bg-white ${
                  eligible ? 'border-gray-200' : 'border-gray-100 opacity-55'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!eligible}
                  checked={selected.includes(lead.id)}
                  onChange={() => toggleLead(lead.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-sm text-gray-900 truncate">{lead.business_name}</span>
                    <span className="text-sm font-semibold text-blue-600">{lead.total_score}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {lead.type || 'Lead'} · {lead.address || 'No address'} · {lead.distance_km} km
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {lead.email || 'Missing email'} · {lead.draft_count}/3 drafts · {lead.status}
                  </p>
                </div>
              </label>
            );
          })}
          {visibleLeads.length === 0 ? (
            <p className="text-sm text-gray-500">No leads found for this week.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

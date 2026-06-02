'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Preset {
  id: number;
  name: string;
  categories: string;
}

interface Run {
  id: number;
  preset_id: number;
  preset_name: string;
  started_at: string;
  lead_count: number;
}

interface Lead {
  id: number;
  run_id: number;
  preset_id: number;
  rank: number;
  business_name: string;
  place_id: string;
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

function runLabel(run: Run) {
  return `${run.preset_name} - ${new Date(run.started_at).toLocaleString()} - ${run.lead_count} leads`;
}

export default function CampaignCreateForm({
  presets,
  runs,
  leads,
}: {
  presets: Preset[];
  runs: Run[];
  leads: Lead[];
}) {
  const router = useRouter();
  const [presetId, setPresetId] = useState(presets[0]?.id || 0);
  const initialRun = runs.find((run) => run.preset_id === presetId) || runs[0];
  const [runId, setRunId] = useState(initialRun?.id || 0);
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [dailyCap, setDailyCap] = useState(5);
  const [startAt, setStartAt] = useState(localDateTimeValue());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const preset = presets.find((item) => item.id === presetId);
  const categories = preset ? JSON.parse(preset.categories).join(', ') : '';
  const presetRuns = useMemo(
    () => runs.filter((run) => run.preset_id === presetId),
    [runs, presetId]
  );
  const visibleLeads = useMemo(
    () => leads.filter((lead) => lead.run_id === runId && lead.preset_id === presetId),
    [leads, presetId, runId]
  );
  const eligibleLeadIds = visibleLeads
    .filter((lead) => lead.email && lead.draft_count >= 3)
    .map((lead) => lead.id);

  useEffect(() => {
    const nextRun = runs.find((run) => run.preset_id === presetId);
    setRunId(nextRun?.id || 0);
    setSelected([]);
  }, [presetId, runs]);

  useEffect(() => {
    setSelected([]);
  }, [runId]);

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
    const selectedRun = runs.find((run) => run.id === runId);
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset_id: presetId,
        name: name || `${preset?.name || 'Campaign'} - ${selectedRun ? new Date(selectedRun.started_at).toLocaleDateString() : new Date().toLocaleDateString()}`,
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
            <span className="text-xs font-medium text-gray-500">Result Run</span>
            <select
              value={runId}
              onChange={(e) => setRunId(Number(e.target.value))}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white"
              disabled={presetRuns.length === 0}
            >
              {presetRuns.map((run) => (
                <option key={run.id} value={run.id}>{runLabel(run)}</option>
              ))}
            </select>
            {presetRuns.length === 0 ? (
              <span className="block text-xs text-red-500 mt-1">Run this preset before creating a campaign.</span>
            ) : null}
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-500">Campaign Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Offices - Week 1"
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
            {selected.length} leads selected from this run. The bot will create Touch 1, Touch 2, and Touch 3 schedules after you create the campaign.
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            onClick={submit}
            disabled={submitting || !presetId || !runId || selected.length === 0}
            className="w-full bg-gray-900 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Campaign'}
          </button>
        </div>
      </aside>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Run Leads</h2>
            <p className="text-xs text-gray-500">Only leads from the selected preset run are shown.</p>
          </div>
          <button onClick={selectAllEligible} className="border border-gray-300 rounded px-3 py-2 text-sm bg-white">
            Select Eligible
          </button>
        </div>

        <div className="space-y-2">
          {visibleLeads.map((lead) => {
            const eligible = Boolean(lead.email && lead.draft_count >= 3);
            return (
              <label
                key={`${lead.run_id}-${lead.id}`}
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
                    <a
                      href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(lead.place_id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-sm text-gray-900 truncate hover:text-blue-600 hover:underline"
                      title="Open on Google Maps"
                    >
                      {lead.business_name}
                    </a>
                    <span className="text-sm font-semibold text-blue-600">{lead.total_score}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    #{lead.rank} - {lead.type || 'Lead'} - {lead.address || 'No address'} - {lead.distance_km} km
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {lead.email || 'Missing email'} - {lead.draft_count}/3 drafts - {lead.status}
                  </p>
                </div>
              </label>
            );
          })}
          {visibleLeads.length === 0 ? (
            <p className="text-sm text-gray-500">No leads found for this preset run.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

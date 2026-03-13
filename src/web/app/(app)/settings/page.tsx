'use client';

import { useState, useEffect, useCallback } from 'react';

interface Preset {
  id: number;
  name: string;
  location: string;
  radius_km: number;
  office_lat: number;
  office_lng: number;
  categories: string;
  top_n: number;
  is_default: number;
}

interface Schedule {
  id: number;
  preset_id: number;
  cron: string;
  enabled: number;
}

const ALL_CATEGORIES = [
  'restaurants', 'offices', 'clinics', 'gyms',
  'schools', 'retail stores', 'community centers', 'industrial facilities'
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function cronToUI(cron: string): { day: number; hour: number; minute: number } {
  const parts = cron.split(' ');
  return { minute: parseInt(parts[0]), hour: parseInt(parts[1]), day: parseInt(parts[4]) };
}

function uiToCron(day: number, hour: number, minute: number): string {
  return `${minute} ${hour} * * ${day}`;
}

export default function SettingsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '', location: 'New Westminster, BC', radius_km: 50,
    office_lat: 49.2026, office_lng: -122.9106,
    categories: [] as string[], top_n: 4, is_default: false,
  });
  const [scheduleForm, setScheduleForm] = useState({ day: 1, hour: 9, minute: 0, enabled: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchPresets = useCallback(async () => {
    const res = await fetch('/api/presets');
    if (res.ok) setPresets(await res.json());
  }, []);

  const fetchSchedules = useCallback(async () => {
    const res = await fetch('/api/schedules');
    if (res.ok) setSchedules(await res.json());
  }, []);

  useEffect(() => { fetchPresets(); fetchSchedules(); }, [fetchPresets, fetchSchedules]);

  function selectPreset(preset: Preset) {
    setSelectedId(preset.id);
    const cats = JSON.parse(preset.categories);
    setForm({
      name: preset.name, location: preset.location, radius_km: preset.radius_km,
      office_lat: preset.office_lat, office_lng: preset.office_lng,
      categories: cats, top_n: preset.top_n, is_default: !!preset.is_default,
    });
    const schedule = schedules.find(s => s.preset_id === preset.id);
    if (schedule) {
      const { day, hour, minute } = cronToUI(schedule.cron);
      setScheduleForm({ day, hour, minute, enabled: !!schedule.enabled });
    } else {
      setScheduleForm({ day: 1, hour: 9, minute: 0, enabled: false });
    }
    setError('');
  }

  function resetForm() {
    setSelectedId(null);
    setForm({
      name: '', location: 'New Westminster, BC', radius_km: 50,
      office_lat: 49.2026, office_lng: -122.9106,
      categories: [], top_n: 4, is_default: false,
    });
    setScheduleForm({ day: 1, hour: 9, minute: 0, enabled: false });
    setError('');
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const payload = { ...form, categories: form.categories };
    const method = selectedId ? 'PATCH' : 'POST';
    const url = selectedId ? `/api/presets/${selectedId}` : '/api/presets';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to save');
      setSaving(false);
      return;
    }
    const saved = await res.json();

    const cronExpr = uiToCron(scheduleForm.day, scheduleForm.hour, scheduleForm.minute);
    const existingSchedule = schedules.find(s => s.preset_id === (selectedId || saved.id));
    if (existingSchedule) {
      await fetch(`/api/schedules/${existingSchedule.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron: cronExpr, enabled: scheduleForm.enabled }),
      });
    } else if (scheduleForm.enabled) {
      await fetch('/api/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset_id: saved.id, cron: cronExpr, enabled: true }),
      });
    }

    await fetchPresets();
    await fetchSchedules();
    setSelectedId(saved.id);
    setSaving(false);
  }

  async function handleDelete() {
    if (!selectedId || !confirm('Delete this preset?')) return;
    await fetch(`/api/presets/${selectedId}`, { method: 'DELETE' });
    resetForm();
    await fetchPresets();
    await fetchSchedules();
  }

  async function handleRunNow(presetId: number) {
    const res = await fetch('/api/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset_id: presetId }),
    });
    if (res.ok) {
      const data = await res.json();
      window.location.href = `/runs?active=${data.run_id}`;
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to start run');
    }
  }

  function toggleCategory(cat: string) {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat],
    }));
  }

  return (
    <div className="flex gap-6 h-full">
      <div className="w-80 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Presets</h2>
          <button onClick={resetForm} className="text-sm text-blue-600 hover:text-blue-800">+ New</button>
        </div>
        <div className="space-y-2">
          {presets.map(preset => (
            <div
              key={preset.id}
              onClick={() => selectPreset(preset)}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedId === preset.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{preset.name}</span>
                {preset.is_default ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Default</span> : null}
              </div>
              <p className="text-xs text-gray-500 mt-1">{preset.location} &middot; {preset.radius_km}km</p>
              <p className="text-xs text-gray-400 mt-0.5">{JSON.parse(preset.categories).join(', ')}</p>
              <button
                onClick={(e) => { e.stopPropagation(); handleRunNow(preset.id); }}
                className="mt-2 text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
              >
                Run Now
              </button>
            </div>
          ))}
          {presets.length === 0 && <p className="text-sm text-gray-400">No presets yet. Create one to get started.</p>}
        </div>
      </div>

      <div className="flex-1 max-w-xl">
        <h2 className="text-lg font-semibold mb-4">{selectedId ? 'Edit Preset' : 'New Preset'}</h2>
        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search Location</label>
            <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Radius: {form.radius_km}km</label>
            <input type="range" min="5" max="100" value={form.radius_km}
              onChange={e => setForm(f => ({ ...f, radius_km: parseInt(e.target.value) }))}
              className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Office Latitude</label>
              <input type="number" step="0.0001" value={form.office_lat}
                onChange={e => setForm(f => ({ ...f, office_lat: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Office Longitude</label>
              <input type="number" step="0.0001" value={form.office_lng}
                onChange={e => setForm(f => ({ ...f, office_lng: parseFloat(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categories</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_CATEGORIES.map(cat => (
                <label key={cat} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.categories.includes(cat)}
                    onChange={() => toggleCategory(cat)} className="rounded" />
                  {cat}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Top N Leads: {form.top_n}</label>
            <input type="number" min="1" max="20" value={form.top_n}
              onChange={e => setForm(f => ({ ...f, top_n: parseInt(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:border-blue-500 focus:outline-none" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_default}
              onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded" />
            Set as default preset
          </label>

          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-3">Schedule</h3>
            <label className="flex items-center gap-2 text-sm mb-3">
              <input type="checkbox" checked={scheduleForm.enabled}
                onChange={e => setScheduleForm(f => ({ ...f, enabled: e.target.checked }))} className="rounded" />
              Enable scheduled runs
            </label>
            {scheduleForm.enabled && (
              <div className="flex gap-3 items-center">
                <select value={scheduleForm.day}
                  onChange={e => setScheduleForm(f => ({ ...f, day: parseInt(e.target.value) }))}
                  className="px-3 py-2 border border-gray-300 rounded">
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
                <span className="text-sm text-gray-500">at</span>
                <input type="time" value={`${String(scheduleForm.hour).padStart(2, '0')}:${String(scheduleForm.minute).padStart(2, '0')}`}
                  onChange={e => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    setScheduleForm(f => ({ ...f, hour: h, minute: m }));
                  }}
                  className="px-3 py-2 border border-gray-300 rounded" />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving || !form.name || form.categories.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            {selectedId && (
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

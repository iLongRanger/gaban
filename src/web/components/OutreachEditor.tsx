'use client';

import { useState } from 'react';

interface Draft {
  id: number;
  style: string;
  email_subject: string;
  email_body: string;
  dm: string;
  edited_email_body: string | null;
  edited_dm: string | null;
  selected: number;
}

const STYLE_LABELS: Record<string, string> = {
  curious_neighbor: 'Curious Neighbor',
  value_lead: 'Value Lead',
  compliment_question: 'Compliment + Question',
};

export default function OutreachEditor({
  drafts,
  leadId,
}: {
  drafts: Draft[];
  leadId: number;
}) {
  const [activeTab, setActiveTab] = useState(drafts[0]?.style || '');
  const [draftState, setDraftState] = useState(drafts);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState('');

  const active = draftState.find(d => d.style === activeTab);
  if (!active) return null;

  const currentEmail = active.edited_email_body ?? active.email_body;
  const currentDm = active.edited_dm ?? active.dm;
  const activeId = active.id;
  const activeEmailSubject = active.email_subject;

  async function saveDraft(updates: Record<string, unknown>) {
    const res = await fetch('/api/drafts/' + activeId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const updated = await res.json();
    setDraftState(prev => prev.map(d => (d.id === updated.id ? updated : d)));
  }

  async function handleCopy(type: 'email' | 'dm') {
    const text =
      type === 'email'
        ? 'Subject: ' + activeEmailSubject + '\n\n' + currentEmail
        : currentDm;
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(''), 2000);

    await saveDraft({ selected: true });
    await fetch('/api/leads/' + leadId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'contacted' }),
    });
  }

  async function handleReset() {
    await saveDraft({ reset: true });
    setEditing(false);
  }

  return (
    <div>
      <div className="flex gap-1 mb-4 border-b">
        {draftState.map(d => (
          <button
            key={d.style}
            onClick={() => {
              setActiveTab(d.style);
              setEditing(false);
            }}
            className={
              'px-3 py-2 text-sm font-medium border-b-2 transition-colors ' +
              (activeTab === d.style
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700')
            }
          >
            {STYLE_LABELS[d.style] || d.style}
            {d.selected ? ' *' : ''}
          </button>
        ))}
      </div>

      <div key={activeTab} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <p className="text-xs text-gray-400 mb-1">Subject: {active.email_subject}</p>
          {editing ? (
            <textarea
              className="w-full border border-gray-300 rounded p-2 text-sm"
              rows={4}
              defaultValue={currentEmail}
              onBlur={e => saveDraft({ edited_email_body: e.target.value })}
            />
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded">
              {currentEmail}
            </p>
          )}
          <button
            onClick={() => handleCopy('email')}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            {copied === 'email' ? 'Copied!' : 'Copy email'}
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">DM</label>
          {editing ? (
            <textarea
              className="w-full border border-gray-300 rounded p-2 text-sm"
              rows={2}
              defaultValue={currentDm}
              onBlur={e => saveDraft({ edited_dm: e.target.value })}
            />
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded">
              {currentDm}
            </p>
          )}
          <button
            onClick={() => handleCopy('dm')}
            className="mt-1 text-xs text-blue-600 hover:underline"
          >
            {copied === 'dm' ? 'Copied!' : 'Copy DM'}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setEditing(!editing)}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
          {(active.edited_email_body || active.edited_dm) && (
            <button
              onClick={handleReset}
              className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

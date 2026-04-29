'use client';

import { useState } from 'react';

interface Note {
  id: number;
  content: string;
  created_at: string;
}

export default function NotesSection({
  leadId,
  initialNotes,
}: {
  leadId: number;
  initialNotes: Note[];
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [content, setContent] = useState('');

  async function addNote() {
    if (!content.trim()) return;
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, content }),
    });
    const note = await res.json();
    setNotes(prev => [note, ...prev]);
    setContent('');
  }

  return (
    <div>
      <h3 className="font-semibold mb-2">Notes</h3>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNote()}
          placeholder="Add a note..."
          className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm"
        />
        <button
          onClick={addNote}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add
        </button>
      </div>
      <div className="space-y-2">
        {notes.map(note => (
          <div key={note.id} className="bg-gray-50 p-2 rounded text-sm">
            <p>{note.content}</p>
            <p className="text-xs text-gray-400 mt-1">
              {new Date(note.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
